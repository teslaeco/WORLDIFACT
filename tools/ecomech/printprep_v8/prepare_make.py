#!/usr/bin/env python3
"""Bounded, offline MAKE-candidate repair of the ORIGINAL ECOMECH V7 mesh.

Never claims recovered 360-degree anatomy, faithful mechanical detail, minimum
wall certification or supplier approval. Source GLB is read-only. STL is mm,
GLB is metres. Voxel union and uniform thickening are explicitly lossy changes.
"""
from __future__ import annotations
import argparse, hashlib, json, math, os, struct, time
from pathlib import Path
import numpy as np
import scipy.ndimage as ndi
from skimage.measure import marching_cubes
import trimesh
import vtk
from vtk.util.numpy_support import numpy_to_vtk, vtk_to_numpy, numpy_to_vtkIdTypeArray

SOURCE_SHA = 'a9cf5b06e450577ef420a3c95b80017f401caf6c1674e10cc09e254be057dd48'
EXPECTED = {'NEURAL_helmet', 'NEURAL_chest', 'NEURAL_raised_arm_chili',
            'NEURAL_right_arm_mechanics', 'NEURAL_armored_left_leg', 'NEURAL_mechanical_right_leg'}
MAX_GRID = 85_000_000

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def vtk_poly(mesh: trimesh.Trimesh):
    poly=vtk.vtkPolyData(); points=vtk.vtkPoints()
    points.SetData(numpy_to_vtk(np.ascontiguousarray(mesh.vertices, dtype=np.float64),deep=True))
    poly.SetPoints(points)
    cells=vtk.vtkCellArray()
    faces=np.column_stack((np.full(len(mesh.faces),3,dtype=np.int64),mesh.faces)).ravel()
    cells.SetCells(len(mesh.faces),numpy_to_vtkIdTypeArray(faces,deep=True));poly.SetPolys(cells)
    return poly

def ball(radius: int):
    z,y,x=np.ogrid[-radius:radius+1,-radius:radius+1,-radius:radius+1]
    return x*x+y*y+z*z<=radius*radius

def raster(mesh, origin, dims, pitch):
    grid=vtk.vtkImageData(); grid.SetOrigin(*origin);grid.SetSpacing(pitch,pitch,pitch)
    grid.SetDimensions(*[int(i) for i in dims]);grid.AllocateScalars(vtk.VTK_UNSIGNED_CHAR,1)
    vtk_to_numpy(grid.GetPointData().GetScalars()).fill(1)
    filt=vtk.vtkPolyDataToImageStencil();filt.SetInputData(vtk_poly(mesh))
    filt.SetOutputOrigin(*origin);filt.SetOutputSpacing(pitch,pitch,pitch)
    filt.SetOutputWholeExtent(grid.GetExtent());filt.SetTolerance(1e-5);filt.Update()
    stencil=vtk.vtkImageStencil();stencil.SetInputData(grid)
    stencil.SetStencilConnection(filt.GetOutputPort());stencil.ReverseStencilOff()
    stencil.SetBackgroundValue(0);stencil.Update()
    return vtk_to_numpy(stencil.GetOutput().GetPointData().GetScalars()).reshape(tuple(dims[::-1])).astype(bool)

def audit(mesh):
    m=mesh.copy();m.merge_vertices();m.remove_unreferenced_vertices()
    edge_counts=np.bincount(m.edges_unique_inverse)
    components=m.split(only_watertight=False)
    return {'vertices':len(m.vertices),'triangles':len(m.faces),
      'watertight':bool(m.is_watertight),'windingConsistent':bool(m.is_winding_consistent),
      'positiveVolume':bool(m.volume>0),'volumeMm3':float(m.volume),
      'connectedComponents':len(components),
      'boundaryEdges':int(np.count_nonzero(edge_counts==1)),
      'nonManifoldEdges':int(np.count_nonzero(edge_counts>2)),
      'degenerateFaces':int(np.count_nonzero(m.area_faces<1e-9)),
      'boundsMm':m.bounds.tolist(),'sizeMm':m.extents.tolist()}

def thickness_screen(mesh, target_mm=2., samples=2000):
    """Normal-ray chord screening, NOT a certified minimum wall-thickness test.
    Convex grazing edges, surface curvature and opposing-surface selection can
    under/overestimate wall thickness. Retain both sample coordinates and misses.
    """
    tree=vtk.vtkOBBTree();tree.SetDataSet(vtk_poly(mesh));tree.BuildLocator()
    rng=np.random.default_rng(816);prob=mesh.area_faces/mesh.area_faces.sum()
    chosen=rng.choice(len(mesh.faces),size=min(samples,len(mesh.faces)),replace=False,p=prob)
    spans=[];low=[];miss=0
    distance=float(np.linalg.norm(mesh.extents)*1.1)
    for i in chosen:
        p=mesh.triangles_center[i];n=mesh.face_normals[i]
        start=p-n*.02;end=p-n*distance
        pts=vtk.vtkPoints();ids=vtk.vtkIdList()
        tree.IntersectWithLine(start,end,pts,ids)
        values=[]
        for j in range(pts.GetNumberOfPoints()):
            q=np.array(pts.GetPoint(j));d=float(np.dot(p-q,n))
            if d>.04: values.append(d)
        if not values:miss+=1;continue
        value=min(values);spans.append(value)
        if value<target_mm:low.append({'faceIndex':int(i),'chordMm':round(value,4),'pointMm':p.round(4).tolist()})
    return {'method':'SAMPLED_INWARD_NORMAL_RAY_CHORD_NOT_FULL_WALL_CERTIFICATION',
      'targetMm':target_mm,'requestedSamples':len(chosen),'hitSamples':len(spans),'missSamples':miss,
      'minimumSampledChordMm':float(min(spans)) if spans else None,
      'fifthPercentileChordMm':float(np.quantile(spans,.05)) if spans else None,
      'belowTargetSamples':len(low),'belowTargetFraction':len(low)/len(spans) if spans else None,
      'smallFeatureExamples':low[:80], 'fullMinimumThicknessVerified':False}

def prepare(source:Path,out:Path,height_mm=200.,pitch_mm=.4,thicken_mm=.6):
    start=time.monotonic()
    if not (100<=height_mm<=250 and .25<=pitch_mm<=.8 and 0<=thicken_mm<=1.):
        raise ValueError('UNREVIEWED_PRINT_PROFILE')
    if not source.is_file() or source.stat().st_size>50_000_000 or sha(source)!=SOURCE_SHA:
        raise ValueError('ORIGINAL_V7_GLB_SHA_REQUIRED')
    raw=source.read_bytes()
    if raw[:4]!=b'glTF' or struct.unpack_from('<II',raw,4)!=(2,len(raw)):
        raise ValueError('INVALID_ORIGINAL_GLB')
    jslen,typ=struct.unpack_from('<II',raw,12)
    doc=json.loads(raw[20:20+jslen])
    if typ!=0x4e4f534a or any('uri' in e and not str(e['uri']).startswith('data:') for e in doc.get('buffers',[])+doc.get('images',[])):
        raise ValueError('SELF_CONTAINED_GLB_REQUIRED')
    scene=trimesh.load(source,force='scene',process=False)
    if set(scene.geometry)!=EXPECTED: raise ValueError('ORIGINAL_SIX_GEOMETRIES_REQUIRED')
    if sum(len(g.faces) for g in scene.geometry.values())!=218450:raise ValueError('ORIGINAL_TRIANGLES_CHANGED')
    meshes=[];records=[]
    # Preserve the scene graph, including all source transforms. GLB +Y-up -> STL +Z-up.
    for node in scene.graph.nodes_geometry:
        matrix,name=scene.graph.get(node);m=scene.geometry[name].copy();m.apply_transform(matrix)
        if not np.isfinite(m.vertices).all():raise ValueError('NONFINITE_SOURCE')
        parts=m.split(only_watertight=False)
        records.append({'name':name,'triangles':len(m.faces),'components':len(parts),
            'inwardComponents':int(sum(p.volume<0 for p in parts)),'closed':bool(m.is_watertight),
            'rawSignedVolumeM3':float(m.volume)})
        # Orient each connected component outward; do not use texturing to mask surfaces.
        corrected=[]
        for p in parts:
            if p.volume<0:p.invert()
            corrected.append(p)
        m=trimesh.util.concatenate(corrected);meshes.append(m)
    bounds=scene.bounds
    body_span=float(bounds[1,1]-bounds[0,1]);scale=(height_mm-5.)/body_span
    for m in meshes:
        p=np.asarray(m.vertices);m.vertices=np.column_stack([
            (p[:,0]-(bounds[1,0]+bounds[0,0])/2)*scale,
            -p[:,2]*scale,
            (p[:,1]-bounds[0,1])*scale+4.])
    union_bounds=np.vstack([m.bounds for m in meshes]);lo=union_bounds.min(0);hi=union_bounds.max(0)
    # Added support plinth is not part of the original design. One body and base,
    # not a printing support plan; the supplier must choose supports and orientation.
    base_rx=float((hi[0]-lo[0])/2+4);base_ry=float(max(abs(lo[1]),abs(hi[1]))+4)
    lo=np.minimum(lo,[-base_rx,-base_ry,0])-pitch_mm*5
    hi=np.maximum(hi,[base_rx,base_ry,5])+pitch_mm*5
    dims=np.ceil((hi-lo)/pitch_mm).astype(int)+1
    count=math.prod(map(int,dims))
    if count>MAX_GRID:raise ValueError(f'GRID_LIMIT: {count} > {MAX_GRID}')
    occupancy=np.zeros(tuple(dims[::-1]),dtype=bool)
    for m in meshes:
        occupancy|=raster(m,lo,dims,pitch_mm)
    source_occupied=int(occupancy.sum())
    z=lo[2]+np.arange(dims[2])*pitch_mm
    yy=lo[1]+np.arange(dims[1])*pitch_mm;xx=lo[0]+np.arange(dims[0])*pitch_mm
    base_xy=(xx[None,:]/base_rx)**2+(yy[:,None]/base_ry)**2<=1
    occupancy|=((z[:,None,None]>=0)&(z[:,None,None]<=5)) & base_xy[None,:,:]
    radius=max(0,int(round(thicken_mm/pitch_mm)))
    if radius:occupancy=ndi.binary_dilation(occupancy,structure=ball(radius))
    occupancy=ndi.binary_closing(occupancy,structure=ball(2),iterations=1)
    occupancy=ndi.binary_fill_holes(occupancy)
    labels,n=ndi.label(occupancy)
    sizes=np.bincount(labels.ravel());sizes[0]=0
    small_limit=1.0 # explicitly log small removed islands; never silently remove a major part
    drop=np.flatnonzero((sizes*pitch_mm**3<small_limit)&(sizes>0))
    removed=[{'label':int(k),'approxVolumeMm3':float(sizes[k]*pitch_mm**3)} for k in drop]
    if len(drop):occupancy[np.isin(labels,drop)]=False
    del labels
    # Scalar smoothing regularizes voxel stair-steps; sampled deviation recorded below.
    field=ndi.gaussian_filter(occupancy.astype(np.float32),sigma=.65)
    v,f,_,_=marching_cubes(field,level=.5,spacing=(pitch_mm,)*3,allow_degenerate=False)
    vertices=v[:,[2,1,0]]+lo
    final=trimesh.Trimesh(vertices=vertices,faces=f,process=True)
    final.update_faces(final.nondegenerate_faces());final.remove_unreferenced_vertices()
    trimesh.repair.fix_normals(final,multibody=True)
    # Final physical scale, stored explicitly; no hidden import units.
    final.vertices[:,2]-=final.bounds[0,2]
    adjusted_scale=height_mm/final.extents[2]
    final.apply_scale(adjusted_scale)
    # Remove only sub-mm^3 residual specks created by surface regularization;
    # retain their measured volumes in the report. Never delete a major body part.
    components=final.split(only_watertight=False)
    surface_removed=[float(abs(m.volume)) for m in components if abs(m.volume)<1.0]
    substantial=[m for m in components if abs(m.volume)>=1.0]
    if not substantial: raise ValueError('REPAIR_ERASED_ALL_GEOMETRY')
    final=trimesh.util.concatenate(substantial)
    dense_triangles=len(final.faces)
    # Volume-preserving quadratic reduction, accepted only after independent checks.
    dec=vtk.vtkQuadricDecimation();dec.SetInputData(vtk_poly(final));dec.SetTargetReduction(.8)
    dec.VolumePreservationOn();dec.Update();pd=dec.GetOutput()
    vv=vtk_to_numpy(pd.GetPoints().GetData()).copy()
    ff=vtk_to_numpy(pd.GetPolys().GetData()).reshape(-1,4)[:,1:].copy()
    reduced=trimesh.Trimesh(vertices=vv,faces=ff,process=True)
    reduced.update_faces(reduced.nondegenerate_faces());reduced.update_faces(reduced.unique_faces())
    reduced.remove_unreferenced_vertices();trimesh.repair.fix_normals(reduced,multibody=True)
    reduction_qa=audit(reduced)
    volume_error=abs(reduced.volume-final.volume)/max(abs(final.volume),1e-9)
    reduction_accepted=(reduction_qa['watertight'] and reduction_qa['windingConsistent']
        and reduction_qa['positiveVolume'] and reduction_qa['connectedComponents']==len(substantial)
        and reduction_qa['degenerateFaces']==0 and volume_error<.005)
    if reduction_accepted: final=reduced
    final.vertices[:,2]-=final.bounds[0,2]
    final.apply_scale(height_mm/final.extents[2])
    print('REPAIR_SURFACE_EXTRACTED',len(final.faces),'from',dense_triangles,flush=True)
    out.mkdir(parents=True,exist_ok=True)
    stl=out/'ECOMECH_V8_MAKE_CANDIDATE_200mm.stl'
    final.export(stl)
    reopened=trimesh.load(stl,force='mesh',process=True)
    meshqa=audit(reopened)
    structural=meshqa['watertight'] and meshqa['windingConsistent'] and meshqa['positiveVolume'] and meshqa['connectedComponents']==1 and meshqa['boundaryEdges']==meshqa['nonManifoldEdges']==meshqa['degenerateFaces']==0
    print('STRUCTURAL_AUDIT_DONE',meshqa,flush=True)
    thickness=thickness_screen(reopened,samples=1000)
    print('THICKNESS_SCREEN_DONE',thickness['belowTargetSamples'],flush=True)
    # Preview GLB is metres and +Y-up, not STL's implicit millimetre coordinates.
    preview=reopened.copy();p=preview.vertices.copy();preview.vertices=np.column_stack([p[:,0],p[:,2],-p[:,1]])/1000
    preview.visual=trimesh.visual.ColorVisuals(mesh=preview,vertex_colors=[156,169,178,255])
    preview.export(out/'ECOMECH_V8_MAKE_CLAY.glb')
    np.savez_compressed(out/'make_mesh_mm.npz',vertices=reopened.vertices,faces=reopened.faces)
    # Source-only monochrome preview in same vertical scale without changing source bytes.
    baseline=trimesh.util.concatenate(meshes)
    baseline.visual=trimesh.visual.ColorVisuals(mesh=baseline,vertex_colors=[156,169,178,255])
    b=baseline.copy();p=b.vertices.copy();b.vertices=np.column_stack([p[:,0],p[:,2],-p[:,1]])/1000
    b.export(out/'V7_SOURCE_CLAY_FOR_COMPARISON.glb')
    report={'revision':'ecomech-v8-make-candidate-v1','sourceOriginalSha256':SOURCE_SHA,
      'sourceOriginalUnmodified':sha(source)==SOURCE_SHA,'sourceMeshes':records,
      'workingProfile':{'overallHeightMm':height_mm,'process':'RESIN_RESEARCH_ONLY_NOT_SUPPLIER_APPROVED',
        'unitsStl':'mm','unitsGlb':'m','chosenBy':'ENGINEERING_WORKING_ASSUMPTION_NOT_CUSTOMER_DIMENSION'},
      'method':'VOXEL_BOOLEAN_UNION_AND_UNIFORM_THICKENING_OF_EXISTING_V7_NOT_NEW_IMAGE_TO_3D',
      'pitchMm':pitch_mm,'requestedThickeningMm':thicken_mm,'gridVoxels':count,'denseExtractionTriangles':dense_triangles,
      'postSurfaceRemovedVolumesMm3':surface_removed,'reductionAccepted':bool(reduction_accepted),
      'reductionVolumeRelativeError':float(volume_error),
      'radiusVoxels':radius,'sourceOccupiedVoxels':source_occupied,'removedSubMm3Islands':removed,
      'addedGeometry':'OVAL_SUPPORT_PLINTH_5MM_INITIAL_HEIGHT',
      'finalScaleAdjustment':adjusted_scale,'stlSha256':sha(stl),'stlBytes':stl.stat().st_size,
      'structuralAudit':meshqa,'structuralGatePassed':bool(structural),'thicknessScreen':thickness,
      'selfIntersectionFullTest':'NOT_PERFORMED; voxel re-extraction is not proof',
      'referenceFidelity':'NOT_ACCEPTED; inherited V7 geometry and lossy repair',
      'mechanicalFeaturesFromTexture':'NOT_RECONSTRUCTED_IN_THIS_PASS',
      'texturePreservedInOriginalOnly':True,'stlCarriesColor':False,
      'supplierAccepted':False,'slicerAccepted':False,'physicalTestPrinted':False,'printReady':False,
      'newOpenAiCalls':0,'newPaidVendorCalls':0,'productionDeployed':False,
      'elapsedSeconds':round(time.monotonic()-start,2)}
    (out/'MAKE_QA.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'structural':meshqa,'thinSamples':thickness['belowTargetSamples'],
       'sourceComponents':sum(x['components'] for x in records),'printReady':False,
       'elapsed':report['elapsedSeconds']}),flush=True)
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    p.add_argument('--height-mm',type=float,default=200.);p.add_argument('--pitch-mm',type=float,default=.4)
    p.add_argument('--thicken-mm',type=float,default=.6);a=p.parse_args()
    prepare(a.source,a.out,a.height_mm,a.pitch_mm,a.thicken_mm)
