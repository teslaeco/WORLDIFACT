import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { PORTALS } from '../config/portals'

interface StartingWorldProps {
  onPortalOpen: (portalId: string) => void
}

type TouchMoveState = {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
}

function supportsWebGL() {
  const canvas = document.createElement('canvas')
  return !!(canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
}

function makePortalTexture(title: string, accent: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return new THREE.CanvasTexture(canvas)
  }

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#0a1f34')
  gradient.addColorStop(1, accent)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = 'rgba(255,255,255,0.86)'
  ctx.fillRect(20, 20, canvas.width - 40, canvas.height - 40)

  ctx.fillStyle = '#0f172a'
  ctx.textAlign = 'center'
  ctx.font = '700 44px Arial'
  ctx.fillText(title, canvas.width / 2, canvas.height / 2)
  ctx.font = '500 20px Arial'
  ctx.fillText('PORTAL PREVIEW', canvas.width / 2, canvas.height / 2 + 40)

  return new THREE.CanvasTexture(canvas)
}

export default function StartingWorld({ onPortalOpen }: StartingWorldProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const touchMoveRef = useRef<TouchMoveState>({ forward: false, back: false, left: false, right: false })
  const nearestPortalRef = useRef<string | null>(null)
  const [loadingProgress, setLoadingProgress] = useState(5)
  const [instructionsHidden, setInstructionsHidden] = useState(false)
  const [webglUnavailable, setWebglUnavailable] = useState(false)
  const [riverProximity, setRiverProximity] = useState(0)
  const [nearestPortal, setNearestPortal] = useState<string | null>(null)
  const [touchMove, setTouchMove] = useState<TouchMoveState>({ forward: false, back: false, left: false, right: false })

  const updateTouchMove = (key: keyof TouchMoveState, value: boolean) => {
    setTouchMove((state) => {
      const next = { ...state, [key]: value }
      touchMoveRef.current = next
      return next
    })
  }

  useEffect(() => {
    touchMoveRef.current = touchMove
  }, [touchMove])

  useEffect(() => {
    if (!supportsWebGL()) {
      setWebglUnavailable(true)
      return undefined
    }

    const mountElement = mountRef.current
    if (!mountElement) {
      return undefined
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#87ceeb')
    scene.fog = new THREE.Fog('#b6d9b8', 25, 140)

    const camera = new THREE.PerspectiveCamera(70, mountElement.clientWidth / mountElement.clientHeight, 0.1, 300)
    camera.position.set(0, 1.8, 22)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(mountElement.clientWidth, mountElement.clientHeight)
    mountElement.appendChild(renderer.domElement)

    setLoadingProgress(25)

    const ambient = new THREE.HemisphereLight('#f8ffe1', '#3b4f2d', 0.9)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight('#fff8d6', 1.4)
    sun.position.set(24, 34, 12)
    scene.add(sun)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220, 16, 16),
      new THREE.MeshStandardMaterial({ color: '#5ea861', roughness: 0.95, metalness: 0 }),
    )
    ground.rotation.x = -Math.PI / 2
    scene.add(ground)

    const riverMaterial = new THREE.MeshStandardMaterial({
      color: '#2f8ec2',
      transparent: true,
      opacity: 0.88,
      roughness: 0.12,
      metalness: 0.1,
    })

    const river = new THREE.Mesh(new THREE.PlaneGeometry(220, 9, 16, 2), riverMaterial)
    river.rotation.x = -Math.PI / 2
    river.position.y = 0.02
    scene.add(river)

    const mountainGeometry = new THREE.ConeGeometry(16, 26, 5)
    const mountainMaterial = new THREE.MeshStandardMaterial({ color: '#658b63', roughness: 1 })
    for (let i = -4; i <= 4; i += 1) {
      const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial)
      mountain.position.set(i * 18, 10, -72 - Math.abs(i) * 2)
      scene.add(mountain)
    }

    const treeGeometry = new THREE.ConeGeometry(0.8, 2.4, 7)
    const treeMaterial = new THREE.MeshStandardMaterial({ color: '#2f6f39', roughness: 0.92 })
    const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.16, 0.7)
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#6b4f2c', roughness: 1 })
    for (let i = 0; i < 55; i += 1) {
      const side = i % 2 === 0 ? 1 : -1
      const x = (Math.random() * 44 + 4) * side
      const z = (Math.random() - 0.5) * 180
      if (Math.abs(z) < 8) {
        continue
      }
      const treeTop = new THREE.Mesh(treeGeometry, treeMaterial)
      const treeTrunk = new THREE.Mesh(trunkGeometry, trunkMaterial)
      treeTop.position.set(x, 1.8, z)
      treeTrunk.position.set(x, 0.4, z)
      scene.add(treeTop)
      scene.add(treeTrunk)
    }

    const rockGeometry = new THREE.DodecahedronGeometry(0.5, 0)
    const rockMaterial = new THREE.MeshStandardMaterial({ color: '#7f8e79', roughness: 1 })
    for (let i = 0; i < 70; i += 1) {
      const rock = new THREE.Mesh(rockGeometry, rockMaterial)
      rock.position.set((Math.random() - 0.5) * 70, 0.24, (Math.random() - 0.5) * 160)
      if (Math.abs(rock.position.z) < 6.5) {
        continue
      }
      rock.rotation.set(Math.random(), Math.random(), Math.random())
      scene.add(rock)
    }

    const portalMeshes = PORTALS.map((portal) => {
      const texture = makePortalTexture(portal.shortTitle, portal.color)
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0 })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), material)
      mesh.position.set(portal.position.x, 1.6, portal.position.z)
      mesh.userData.portalId = portal.id
      scene.add(mesh)
      return { mesh, material, texture }
    })

    setLoadingProgress(100)

    const keyState: Record<string, boolean> = {}
    let dragging = false
    const pointer = new THREE.Vector2()
    const raycaster = new THREE.Raycaster()
    const playerPosition = new THREE.Vector3(0, 1.8, 22)
    let yaw = Math.PI
    let pitch = 0
    const tempDirection = new THREE.Vector3()
    const forwardDirection = new THREE.Vector3()
    const rightDirection = new THREE.Vector3()

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      keyState[key] = true
      if (key === 'e' && nearestPortalRef.current) {
        onPortalOpen(nearestPortalRef.current)
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      keyState[event.key.toLowerCase()] = false
    }

    const onPointerDown = () => {
      dragging = true
    }

    const onPointerUp = (event: PointerEvent) => {
      dragging = false
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const intersects = raycaster.intersectObjects(portalMeshes.map((item) => item.mesh), false)
      const firstHit = intersects[0]
      if (!firstHit) {
        return
      }
      const portalMesh = firstHit.object as THREE.Mesh
      const material = portalMesh.material as THREE.MeshBasicMaterial
      if (material.opacity > 0.2) {
        const portalId = portalMesh.userData.portalId as string
        onPortalOpen(portalId)
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) {
        return
      }
      yaw -= event.movementX * 0.0025
      pitch = Math.max(-0.95, Math.min(0.95, pitch - event.movementY * 0.0025))
    }

    const onResize = () => {
      if (!mountRef.current) {
        return
      }
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    window.addEventListener('resize', onResize)

    const clock = new THREE.Clock()
    let frameId = 0

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.05)
      const elapsed = clock.elapsedTime
      const activeTouchMove = touchMoveRef.current

      const moveForward = keyState.w || keyState.arrowup || activeTouchMove.forward
      const moveBack = keyState.s || keyState.arrowdown || activeTouchMove.back
      const moveLeft = keyState.a || keyState.arrowleft || activeTouchMove.left
      const moveRight = keyState.d || keyState.arrowright || activeTouchMove.right

      tempDirection.set(0, 0, 0)
      if (moveForward) tempDirection.z -= 1
      if (moveBack) tempDirection.z += 1
      if (moveLeft) tempDirection.x -= 1
      if (moveRight) tempDirection.x += 1

      if (tempDirection.lengthSq() > 0) {
        tempDirection.normalize()
        setInstructionsHidden((hidden) => hidden || true)
      }

      const speed = 10
      forwardDirection.set(Math.sin(yaw), 0, Math.cos(yaw))
      rightDirection.set(Math.cos(yaw), 0, -Math.sin(yaw))

      playerPosition.addScaledVector(forwardDirection, tempDirection.z * speed * delta)
      playerPosition.addScaledVector(rightDirection, tempDirection.x * speed * delta)
      playerPosition.x = Math.max(-40, Math.min(40, playerPosition.x))
      playerPosition.z = Math.max(-90, Math.min(90, playerPosition.z))

      camera.position.copy(playerPosition)
      const lookTarget = new THREE.Vector3(
        playerPosition.x + Math.sin(yaw) * Math.cos(pitch),
        playerPosition.y + Math.sin(pitch),
        playerPosition.z + Math.cos(yaw) * Math.cos(pitch),
      )
      camera.lookAt(lookTarget)

      const distanceToRiver = Math.abs(playerPosition.z)
      const fade = THREE.MathUtils.clamp(1 - distanceToRiver / 22, 0, 1)
      setRiverProximity((previous) => (Math.abs(previous - fade) > 0.04 ? fade : previous))

      let closest: string | null = null
      let closestDistance = Infinity

      for (const portalMesh of portalMeshes) {
        const wobble = reducedMotion ? 0 : Math.sin(elapsed * 0.8 + portalMesh.mesh.position.x) * 0.1
        portalMesh.mesh.position.y = 1.6 + wobble
        portalMesh.material.opacity = fade * 0.92

        const distance = portalMesh.mesh.position.distanceTo(playerPosition)
        if (fade > 0.2 && distance < closestDistance) {
          closestDistance = distance
          closest = portalMesh.mesh.userData.portalId as string
        }
      }

      const nextNearest = closestDistance < 3 ? closest : null
      nearestPortalRef.current = nextNearest
      setNearestPortal((previous) => (previous === nextNearest ? previous : nextNearest))

      riverMaterial.color.setHSL(0.55 + (reducedMotion ? 0 : Math.sin(elapsed * 0.4) * 0.02), 0.6, 0.48)

      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(animate)
    }

    frameId = window.requestAnimationFrame(animate)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('resize', onResize)

      for (const portalMesh of portalMeshes) {
        portalMesh.texture.dispose()
        portalMesh.material.dispose()
        portalMesh.mesh.geometry.dispose()
      }

      treeGeometry.dispose()
      treeMaterial.dispose()
      trunkGeometry.dispose()
      trunkMaterial.dispose()
      rockGeometry.dispose()
      rockMaterial.dispose()
      mountainGeometry.dispose()
      mountainMaterial.dispose()
      river.geometry.dispose()
      riverMaterial.dispose()
      ground.geometry.dispose()
      ;(ground.material as THREE.MeshStandardMaterial).dispose()

      renderer.dispose()
      scene.clear()
      if (mountElement.contains(renderer.domElement)) {
        mountElement.removeChild(renderer.domElement)
      }
    }
  }, [onPortalOpen])

  if (webglUnavailable) {
    return (
      <section className="webgl-fallback" role="alert">
        <h2>3D world unavailable</h2>
        <p>
          WebGL is unavailable in this browser. Use the accessible portal list below to open all five WORLDIFACT
          destinations.
        </p>
      </section>
    )
  }

  return (
    <section className="starting-world-shell" aria-label="WORLDIFACT starting world">
      <div className="starting-world" ref={mountRef} />
      {loadingProgress < 100 ? <div className="loading-overlay">Loading world {loadingProgress}%</div> : null}
      {!instructionsHidden ? (
        <div className="instructions" role="note">
          <p>Move: WASD / Arrow Keys or touch controls</p>
          <p>Look: drag mouse / touch</p>
          <p>Portal: click portal card or move close and press E</p>
        </div>
      ) : null}
      {riverProximity > 0.2 ? <div className="river-hint">Portal reflections are appearing in the river…</div> : null}
      {nearestPortal ? <div className="portal-hint">Portal in range — press E to enter.</div> : null}
      <div className="touch-controls" aria-label="Touch controls">
        <button
          type="button"
          onPointerDown={() => updateTouchMove('forward', true)}
          onPointerUp={() => updateTouchMove('forward', false)}
          onPointerLeave={() => updateTouchMove('forward', false)}
        >
          ↑
        </button>
        <button
          type="button"
          onPointerDown={() => updateTouchMove('left', true)}
          onPointerUp={() => updateTouchMove('left', false)}
          onPointerLeave={() => updateTouchMove('left', false)}
        >
          ←
        </button>
        <button
          type="button"
          onPointerDown={() => updateTouchMove('back', true)}
          onPointerUp={() => updateTouchMove('back', false)}
          onPointerLeave={() => updateTouchMove('back', false)}
        >
          ↓
        </button>
        <button
          type="button"
          onPointerDown={() => updateTouchMove('right', true)}
          onPointerUp={() => updateTouchMove('right', false)}
          onPointerLeave={() => updateTouchMove('right', false)}
        >
          →
        </button>
        <button type="button" onClick={() => nearestPortal && onPortalOpen(nearestPortal)}>
          Enter Portal
        </button>
      </div>
    </section>
  )
}
