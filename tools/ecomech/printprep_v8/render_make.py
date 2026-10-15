"""Render actual millimetre STL triangles with neutral clay, not image synthesis."""
import argparse, hashlib, json, math
from pathlib import Path
import numpy as np
import trimesh, vtk
from prepare_make import vtk_poly

def render(path:Path,out:Path):
    mesh=trimesh.load(path,force='mesh',process=True)
    out.mkdir(parents=True,exist_ok=True)
    norms=vtk.vtkPolyDataNormals();norms.SetInputData(vtk_poly(mesh))
    norms.SplittingOff();norms.ConsistencyOn();norms.AutoOrientNormalsOn();norms.Update()
    mapper=vtk.vtkPolyDataMapper();mapper.SetInputConnection(norms.GetOutputPort());mapper.ScalarVisibilityOff()
    record={};center=mesh.bounds.mean(0)
    for yaw,label in [(0,'front'),(30,'three_quarter'),(90,'side'),(180,'back')]:
        renderer=vtk.vtkRenderer();renderer.SetBackground(.035,.05,.065)
        renderer.SetBackground2(.18,.205,.23);renderer.GradientBackgroundOn()
        window=vtk.vtkRenderWindow();window.SetOffScreenRendering(1);window.SetSize(900,1150)
        window.SetMultiSamples(0);window.AddRenderer(renderer)
        actor=vtk.vtkActor();actor.SetMapper(mapper)
        prop=actor.GetProperty();prop.SetColor(.63,.69,.73);prop.SetAmbient(.18)
        prop.SetDiffuse(.8);prop.SetSpecular(.25);prop.SetSpecularPower(28)
        renderer.AddActor(actor)
        for pos,intensity,col in [((-240,-300,380),1.,(1,.95,.88)),((220,-130,220),.65,(.7,.85,1)),((-70,220,350),1.3,(.7,1,1))]:
            light=vtk.vtkLight();light.SetLightTypeToSceneLight();light.SetPosition(*pos)
            light.SetFocalPoint(*center);light.SetColor(*col);light.SetIntensity(intensity)
            renderer.AddLight(light)
        camera=renderer.GetActiveCamera();r=math.radians(yaw)
        camera.SetPosition(center[0]+math.sin(r)*600,center[1]-math.cos(r)*600,center[2]+20)
        camera.SetFocalPoint(*center);camera.SetViewUp(0,0,1)
        camera.ParallelProjectionOn();camera.SetParallelScale(mesh.extents[2]*.565)
        # Ambient occlusion comes from actual geometry depth, never a photo overlay.
        steps=vtk.vtkRenderStepsPass();ao=vtk.vtkSSAOPass();ao.SetDelegatePass(steps)
        ao.SetRadius(10);ao.SetBias(.25);ao.SetKernelSize(64);ao.BlurOn();renderer.SetPass(ao)
        renderer.ResetCameraClippingRange();window.Render()
        filt=vtk.vtkWindowToImageFilter();filt.SetInput(window);filt.ReadFrontBufferOff();filt.Update()
        dest=out/(label+'.png');writer=vtk.vtkPNGWriter();writer.SetFileName(str(dest))
        writer.SetInputConnection(filt.GetOutputPort());writer.Write()
        record[label]={'path':dest.name,'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()}
        window.Finalize();print('ACTUAL_STL_RENDER',label,flush=True)
    (out/'render_manifest.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'method':'VTK rendering actual STL triangles; neutral clay; no image projection',
        'actualSourceTriangles':len(mesh.faces),'views':record},indent=2)+'\n')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--stl',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args();render(a.stl,a.out)
