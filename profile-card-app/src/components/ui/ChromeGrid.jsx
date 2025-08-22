'use client'

import React, { useRef, useState, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ExtrudeGeometry, Shape } from 'three'
import * as THREE from 'three'

function Box({ 
  position, 
  width = 4, 
  length = 4, 
  cornerRadius = 2,
  gridPosition,
  hoveredBox,
  rippleScale = 0.3,
  rippleRadius = 3
}) {
  const meshRef = useRef(null);
  const [currentScale, setCurrentScale] = useState(1);
  
  const geometry = useMemo(() => {
    const shape = new Shape();
    const angleStep = Math.PI * 0.5;
    const radius = cornerRadius;
    
    const halfWidth = width / 2;
    const halfLength = length / 2;

    shape.absarc(halfWidth - radius, halfLength - radius, radius, angleStep * 0, angleStep * 1);
    shape.absarc(-halfWidth + radius, halfLength - radius, radius, angleStep * 1, angleStep * 2);
    shape.absarc(-halfWidth + radius, -halfLength + radius, radius, angleStep * 2, angleStep * 3);
    shape.absarc(halfWidth - radius, -halfLength + radius, radius, angleStep * 3, angleStep * 4);

    const extrudeSettings = {
      depth: 0.3,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 20,
      curveSegments: 20
    };

    const geometry = new ExtrudeGeometry(shape, extrudeSettings);
    geometry.center();
    
    return geometry;
  }, [width, length, cornerRadius]);
  
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    if (meshRef.current) {
      let targetScale = 1;
      
      const isThisBoxHovered = hoveredBox && 
        gridPosition[0] === hoveredBox[0] && 
        gridPosition[1] === hoveredBox[1];
      
      if (isThisBoxHovered) {
        targetScale = 5;
      } else if (hoveredBox) {
        const dx = gridPosition[0] - hoveredBox[0];
        const dz = gridPosition[1] - hoveredBox[1];
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance <= rippleRadius && distance > 0) {
          const falloff = Math.max(0, 1 - (distance / rippleRadius));
          const rippleEffect = falloff * rippleScale;
          targetScale = 1 + (rippleEffect * 3);
        }
      }
      
      const lerpFactor = 0.1;
      const newScale = currentScale + (targetScale - currentScale) * lerpFactor;
      setCurrentScale(newScale);
      
      meshRef.current.scale.z = newScale;
    }
  });

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.userData.gridPosition = gridPosition;
    }
  }, [gridPosition]);

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={position}
      rotation={[Math.PI / 2, 0, 0]}
    >
      <meshPhysicalMaterial 
        color="#232323" 
        roughness={0.5} 
        metalness={1}
        clearcoat={1}
        clearcoatRoughness={0}
        clearcoatNormalScale={1}
        clearcoatNormalMap={null}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function HoverDetector({ onHoverChange, targetGroup }) {
  const { camera, raycaster, gl } = useThree();
  const ndcRef = useRef(new THREE.Vector2(0, 0));

  // Track global mouse movement and map to NDC relative to the canvas bounds,
  // so hovering works even when DOM overlays are on top of the Canvas.
  useEffect(() => {
    function onMove(e) {
      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ndcRef.current.set(x, y);
    }
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [gl]);

  useFrame(() => {
    if (!targetGroup?.current) return;
    raycaster.setFromCamera(ndcRef.current, camera);

    const intersects = raycaster.intersectObjects(targetGroup.current.children, true);

    if (intersects.length > 0) {
      for (const intersect of intersects) {
        const mesh = intersect.object;
        if (mesh.userData && mesh.userData.gridPosition) {
          const gridPos = mesh.userData.gridPosition;
          onHoverChange(gridPos);
          return;
        }
      }
    }

    onHoverChange(null);
  });

  return null;
}

function GridOfBoxes() {
  const gridSize = 10;
  const boxWidth = 4;
  const boxLength = 4;
  const gap = 0.05;
  const spacingX = boxWidth + gap;
  const spacingZ = boxLength + gap;
  
  const [hoveredBox, setHoveredBox] = useState(null);
  const rippleScale = 2.5;
  const rippleRadius = 2;
   
  const boxes = [];

  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const posX = (x - (gridSize - 1) / 2) * spacingX;
      const posZ = (z - (gridSize - 1) / 2) * spacingZ;
      
      boxes.push(
        <Box 
          key={`${x}-${z}`} 
          position={[posX, -0.85, posZ]}
          width={boxWidth}
          length={boxLength}
          cornerRadius={0.8}
          gridPosition={[x, z]}
          hoveredBox={hoveredBox}
          rippleScale={rippleScale}
          rippleRadius={rippleRadius}
        />
      );
    }
  }

  const groupRef = useRef();

  return (
    <>
      <HoverDetector onHoverChange={(g)=>{
        // avoid spamming state if same tile
        setHoveredBox(prev => {
          if ((prev && g) && (prev[0] === g[0] && prev[1] === g[1])) return prev;
          if (!prev && !g) return prev;
          return g;
        });
      }} targetGroup={groupRef} />
      <group ref={groupRef}>
        {boxes}
      </group>
    </>
  );
}

export function ChromeGrid() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      width: '100vw',
      height: '100vh',
      background: '#000',
      zIndex: 0,
    }}>
      <Canvas style={{ width: '100%', height: '100%' }} camera={{ 
        position: [-9.31, 12, 24.72], 
        rotation: [-0.65, -0.2, -0.13],
        fov: 35 
      }}>
        <ambientLight intensity={1} />
        
        <directionalLight 
          position={[10, 15, 10]} 
          intensity={10}
          castShadow
        />
        
        <directionalLight 
          position={[-10, 10, -5]} 
          intensity={10}
          color="#ffffff"
        />
        
        <directionalLight 
          position={[5, -10, 15]} 
          intensity={5}
          color="#f0f8ff"
        />
        
        <pointLight 
          position={[0, 20, 3]} 
          intensity={2}
          distance={50}
        />
        
        <pointLight 
          position={[15, 5, 15]} 
          intensity={1.5}
          distance={40}
          color="#ffffff"
        />
                  
        <GridOfBoxes />        
      </Canvas>
    </div>
  )
}

export default ChromeGrid;
