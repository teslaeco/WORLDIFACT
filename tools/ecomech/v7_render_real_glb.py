#!/usr/bin/env python3
"""True glTF/PBR VTK renders of existing model geometry, no generated images."""
import argparse, json, math
from pathlib import Path
from vtkmodules.vtkIOImport import vtkGLTFImporter
from vtkmodules.vtkRenderingCore import vtkRenderer, vtkRenderWindow, vtkLight, vtkWindowToImageFilter
from vtkmodules.vtkIOImage import vtkPNGWriter

def render(glb:Path,out:Path):
    result={}
    for angle,label in [(0,'front'),(28,'three_quarter'),(90,'side'),(180,'back')]:
        renderer=vtkRenderer()
        renderer.SetBackground(.045,.06,.085)
        renderer.SetBackground2(.14,.18,.21)
        renderer.GradientBackgroundOn()
        window=vtkRenderWindow()
        window.SetOffScreenRendering(1)
        window.SetSize(900,1100)
        window.AddRenderer(renderer)
        importer=vtkGLTFImporter()
        importer.SetFileName(str(glb))
        importer.SetRenderWindow(window)
        importer.Update()
        if renderer.GetActors().GetNumberOfItems()<6:
            raise RuntimeError('REAL_IMPORTED_GLB_ACTORS_MISSING')
        renderer.RemoveAllLights()
        renderer.AutomaticLightCreationOff()
        for pos,power,color in [
            ((1,4,5),2.2,(1,.97,.90)),
            ((-3,2,4),1.2,(.66,.82,1)),
            ((1,2,-3),2.0,(.7,.90,1)),
        ]:
            light=vtkLight();light.SetLightTypeToSceneLight()
            light.SetPosition(*pos);light.SetFocalPoint(0,1.4,0)
            light.SetIntensity(power);light.SetColor(*color)
            light.PositionalOn();renderer.AddLight(light)
        camera=renderer.GetActiveCamera()
        r=math.radians(angle)
        camera.SetPosition(math.sin(r)*6.2,1.42,math.cos(r)*6.2)
        camera.SetFocalPoint(0,1.35,0);camera.SetViewUp(0,1,0)
        camera.ParallelProjectionOn();camera.SetParallelScale(1.60)
        for actor in renderer.GetActors():
            prop=actor.GetProperty()
            prop.SetAmbient(.40);prop.SetDiffuse(.78);prop.SetSpecular(.16)
        renderer.ResetCameraClippingRange();window.Render()
        screenshot=vtkWindowToImageFilter()
        screenshot.SetInput(window);screenshot.ReadFrontBufferOff();screenshot.Update()
        dest=out/('real_glb_'+label+'.png')
        writer=vtkPNGWriter();writer.SetFileName(str(dest))
        writer.SetInputConnection(screenshot.GetOutputPort());writer.Write()
        if not dest.exists() or dest.stat().st_size<20000:raise RuntimeError('ACTUAL_GLB_RENDER_FAILED_'+label)
        result[label]={'path':dest.name,'sizeBytes':dest.stat().st_size,
                       'renderer':'VTK_GLTF_ACTUAL_TRIANGLE_MATERIALS'}
        window.Finalize()
    (out/'render-manifest.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result),flush=True)
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--glb',required=True,type=Path)
    parser.add_argument('--out',required=True,type=Path)
    a=parser.parse_args();render(a.glb,a.out)
