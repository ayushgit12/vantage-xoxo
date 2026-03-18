"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface EmbeddingPoint {
  topic_id: string;
  title: string;
  description: string;
  est_hours: number;
  prereq_ids: string[];
  goal_id?: string;
  goal_title?: string;
  x: number;
  y: number;
  z: number;
  neighbors: { topic_id: string; similarity: number }[];
}

interface Edge {
  from: string;
  to: string;
  type: "prereq" | "similar";
  weight?: number;
}

interface EmbeddingData {
  points: EmbeddingPoint[];
  edges: Edge[];
  dimensions: number;
  variance_explained: number;
  total_topics: number;
  embedding_model: string;
  original_dims: number;
  goal_title?: string;
  goals_count?: number;
}

interface PositionedPoint {
  source: EmbeddingPoint;
  position: THREE.Vector3;
  color: THREE.Color;
}

function hashTopicId(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizePoints(points: EmbeddingPoint[]): PositionedPoint[] {
  if (points.length === 0) return [];

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const zs = points.map((p) => p.z);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const maxSpan = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);

  return points.map((point, index) => {
    const hash = hashTopicId(point.topic_id || String(index));
    const hue = (hash % 360) / 360;
    const sat = 0.65 + ((hash >> 8) % 20) / 100;
    const light = 0.48 + ((hash >> 16) % 14) / 100;

    return {
      source: point,
      position: new THREE.Vector3(
        ((point.x - centerX) / maxSpan) * 5.2,
        ((point.y - centerY) / maxSpan) * 5.2,
        ((point.z - centerZ) / maxSpan) * 5.2,
      ),
      color: new THREE.Color().setHSL(hue, Math.min(sat, 0.9), Math.min(light, 0.7)),
    };
  });
}

export default function EmbeddingsScene({
  data,
  onPointHover,
}: {
  data: EmbeddingData;
  onPointHover?: (point: EmbeddingPoint | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(56, 1, 0.01, 100);
    camera.position.set(0, 0.8, 6.2);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.9;
    controls.enablePan = false;
    controls.minDistance = 2;
    controls.maxDistance = 14;

    scene.add(new THREE.AmbientLight("#a5b4fc", 0.6));

    const keyLight = new THREE.PointLight("#38bdf8", 0.8, 40);
    keyLight.position.set(4, 4, 5);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight("#818cf8", 0.45, 35);
    fillLight.position.set(-4, -2, -4);
    scene.add(fillLight);

    const positioned = normalizePoints(data.points);
    const pointIndexById = new Map<string, number>();
    positioned.forEach((p, i) => pointIndexById.set(p.source.topic_id, i));

    const neighborIndicesByPoint = new Map<number, Set<number>>();
    positioned.forEach((point, i) => {
      const neighbors = new Set<number>();
      point.source.neighbors.forEach((neighbor) => {
        const neighborIndex = pointIndexById.get(neighbor.topic_id);
        if (neighborIndex !== undefined) neighbors.add(neighborIndex);
      });
      neighborIndicesByPoint.set(i, neighbors);
    });

    const baseScales = positioned.map(
      (point) => 0.06 + Math.min(point.source.est_hours / 40, 0.05),
    );
    const baseColors = positioned.map((point) => point.color.clone());
    const scratch = new THREE.Object3D();

    const pointGeometry = new THREE.SphereGeometry(1, 14, 14);
    const pointMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      emissive: "#0ea5e9",
      emissiveIntensity: 0.28,
      metalness: 0.45,
      roughness: 0.25,
      transparent: true,
      opacity: 0.96,
    });

    const pointsObject = new THREE.InstancedMesh(pointGeometry, pointMaterial, positioned.length);
    pointsObject.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pointsObject.castShadow = false;
    pointsObject.receiveShadow = false;
    scene.add(pointsObject);

    const setPointTransform = (index: number, scale: number) => {
      scratch.position.copy(positioned[index].position);
      scratch.scale.setScalar(scale);
      scratch.updateMatrix();
      pointsObject.setMatrixAt(index, scratch.matrix);
    };

    let activeNeighborIndices = new Set<number>();
    let hoveredIndex: number | null = null;

    const applyHoverVisuals = (index: number | null) => {
      hoveredIndex = index;
      activeNeighborIndices = index !== null ? (neighborIndicesByPoint.get(index) ?? new Set<number>()) : new Set<number>();

      for (let i = 0; i < positioned.length; i += 1) {
        let scale = baseScales[i];
        const color = baseColors[i].clone();

        if (index !== null) {
          if (i === index) {
            scale *= 2.15;
            color.lerp(new THREE.Color("#ffffff"), 0.35);
          } else if (activeNeighborIndices.has(i)) {
            scale *= 1.45;
            color.lerp(new THREE.Color("#ffffff"), 0.18);
          } else {
            scale *= 0.92;
            color.multiplyScalar(0.42);
          }
        }

        setPointTransform(i, scale);
        pointsObject.setColorAt(i, color);
      }

      if (pointsObject.instanceColor) {
        pointsObject.instanceColor.needsUpdate = true;
      }
      pointsObject.instanceMatrix.needsUpdate = true;
      edgeMaterial.opacity = index === null ? 0.2 : 0.1;
    };

    const edgeGeometry = new THREE.BufferGeometry();
    const edgeVertices: number[] = [];
    data.edges.forEach((edge) => {
      const fromIdx = pointIndexById.get(edge.from);
      const toIdx = pointIndexById.get(edge.to);
      if (fromIdx === undefined || toIdx === undefined) return;

      const from = positioned[fromIdx].position;
      const to = positioned[toIdx].position;

      edgeVertices.push(from.x, from.y, from.z, to.x, to.y, to.z);
    });

    edgeGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(edgeVertices, 3),
    );
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: "#60a5fa",
      transparent: true,
      opacity: 0.2,
    });

    const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    scene.add(edgeLines);

    const hoverHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 16),
      new THREE.MeshBasicMaterial({
        color: "#e0f2fe",
        transparent: true,
        opacity: 0.24,
      }),
    );
    hoverHalo.visible = false;
    scene.add(hoverHalo);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let rafId = 0;
    let lastFrame = 0;

    applyHoverVisuals(null);

    const renderFrame = (now: number) => {
      rafId = requestAnimationFrame(renderFrame);

      // Cap at ~45 FPS for smoother but lighter rendering.
      if (now - lastFrame < 22) return;
      lastFrame = now;

      if (hoveredIndex !== null) {
        const pulse = 1 + Math.sin(now * 0.0075) * 0.06;
        setPointTransform(hoveredIndex, baseScales[hoveredIndex] * 2.15 * pulse);
        pointsObject.instanceMatrix.needsUpdate = true;
        hoverHalo.scale.setScalar(pulse);
      }

      controls.update();
      renderer.render(scene, camera);
    };

    const updateHover = (clientX: number, clientY: number) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(pointsObject, false);

      const index = typeof hits[0]?.instanceId === "number" ? hits[0].instanceId : null;
      if (index === hoveredIndex) return;

      if (index === null) {
        applyHoverVisuals(null);
        hoverHalo.visible = false;
        onPointHover?.(null);
        return;
      }

      applyHoverVisuals(index);
      const selected = positioned[index];
      hoverHalo.visible = true;
      hoverHalo.position.copy(selected.position);
      onPointHover?.(selected.source);
    };

    const onPointerMove = (event: PointerEvent) => {
      updateHover(event.clientX, event.clientY);
    };

    const onPointerLeave = () => {
      applyHoverVisuals(null);
      hoverHalo.visible = false;
      onPointHover?.(null);
    };

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width <= 0 || height <= 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(width, height, false);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);

    resize();
    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);

      controls.dispose();
      pointGeometry.dispose();
      pointMaterial.dispose();
      edgeGeometry.dispose();
      edgeMaterial.dispose();
      hoverHalo.geometry.dispose();
      (hoverHalo.material as THREE.Material).dispose();

      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [data, onPointHover]);

  return <div ref={containerRef} className="h-full w-full" />;
}
