"use client";

import { useRef, useState, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Line } from "@react-three/drei";
import * as THREE from "three";

/* ── Types ─────────────────────────────────────────── */
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

/* ── Glow Particle ─────────────────────────────────── */
function Particle({
  point,
  index,
  isHovered,
  isNeighbor,
  isConnected,
  onHover,
  onUnhover,
  goalColorMap,
}: {
  point: EmbeddingPoint;
  index: number;
  isHovered: boolean;
  isNeighbor: boolean;
  isConnected: boolean;
  onHover: (i: number) => void;
  onUnhover: () => void;
  goalColorMap: Record<string, string>;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const baseScale = 0.04 + Math.min(point.est_hours / 30, 0.06);

  const baseColor = goalColorMap[point.goal_id || "default"] || "#38bdf8";

  const hsl = useMemo(() => {
    const c = new THREE.Color(baseColor);
    const hslObj = { h: 0, s: 0, l: 0 };
    c.getHSL(hslObj);
    return hslObj;
  }, [baseColor]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;

    // Idle float
    const floatY = Math.sin(t * 0.5 + index * 0.7) * 0.008;
    meshRef.current.position.y = point.y + floatY;
    if (glowRef.current) glowRef.current.position.y = point.y + floatY;

    // Scale pulse
    const targetScale = isHovered ? baseScale * 2.2 : isNeighbor ? baseScale * 1.5 : baseScale;
    const current = meshRef.current.scale.x;
    const next = THREE.MathUtils.lerp(current, targetScale, 0.12);
    meshRef.current.scale.setScalar(next);
    if (glowRef.current) glowRef.current.scale.setScalar(next * 3);
  });

  const coreColor = isHovered
    ? new THREE.Color().setHSL(hsl.h, 1, 0.75)
    : isNeighbor
    ? new THREE.Color().setHSL(hsl.h, 0.9, 0.65)
    : new THREE.Color().setHSL(hsl.h, 0.8, 0.55);

  const glowColor = new THREE.Color().setHSL(hsl.h, 1, 0.5);

  const dimmed = !isHovered && !isNeighbor && !isConnected;

  return (
    <group>
      {/* Glow sprite */}
      <mesh ref={glowRef} position={[point.x, point.y, point.z]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={isHovered ? 0.18 : dimmed ? 0.02 : 0.06}
          depthWrite={false}
        />
      </mesh>

      {/* Core sphere */}
      <mesh
        ref={meshRef}
        position={[point.x, point.y, point.z]}
        onPointerOver={(e) => { e.stopPropagation(); onHover(index); }}
        onPointerOut={onUnhover}
      >
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={isHovered ? 2.5 : isNeighbor ? 1.5 : 0.6}
          roughness={0.15}
          metalness={0.9}
          transparent
          opacity={dimmed ? 0.25 : 1}
        />
      </mesh>
    </group>
  );
}

/* ── Edges ─────────────────────────────────────────── */
function Edges({
  edges,
  pointMap,
  hoveredId,
  neighborIds,
}: {
  edges: Edge[];
  pointMap: Record<string, EmbeddingPoint>;
  hoveredId: string | null;
  neighborIds: Set<string>;
}) {
  return (
    <>
      {edges.map((edge, i) => {
        const from = pointMap[edge.from];
        const to = pointMap[edge.to];
        if (!from || !to) return null;

        const isActive =
          hoveredId === edge.from ||
          hoveredId === edge.to ||
          neighborIds.has(edge.from) ||
          neighborIds.has(edge.to);

        const dimmed = hoveredId && !isActive;

        const color = edge.type === "prereq" ? "#60a5fa" : "#a78bfa";
        const opacity = dimmed ? 0.03 : isActive ? 0.6 : 0.1;

        return (
          <Line
            key={i}
            points={[
              [from.x, from.y, from.z],
              [to.x, to.y, to.z],
            ]}
            color={color}
            lineWidth={edge.type === "prereq" ? 1.5 : 0.8}
            transparent
            opacity={opacity}
            dashed={edge.type === "similar"}
            dashSize={0.03}
            gapSize={0.02}
          />
        );
      })}
    </>
  );
}

/* ── Hover Label ───────────────────────────────────── */
function HoverLabel({ point }: { point: EmbeddingPoint }) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.quaternion.copy(camera.quaternion);
    }
  });

  return (
    <group ref={groupRef} position={[point.x, point.y + 0.12, point.z]}>
      {/* bg panel */}
      <mesh position={[0, 0, -0.001]}>
        <planeGeometry args={[0.5, 0.1]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.85} />
      </mesh>
      <Text
        fontSize={0.028}
        color="#e0f2fe"
        anchorX="center"
        anchorY="middle"
        maxWidth={0.45}
      >
        {point.title}
      </Text>
      <Text
        fontSize={0.016}
        color="#7dd3fc"
        anchorX="center"
        anchorY="middle"
        position={[0, -0.03, 0]}
      >
        {point.est_hours}h · {point.neighbors.length} neighbors
      </Text>
    </group>
  );
}

/* ── Grid / Environment ───────────────────────────── */
function SceneEnvironment() {
  const gridRef = useRef<THREE.GridHelper>(null!);

  useFrame((state) => {
    if (gridRef.current) {
      (gridRef.current.material as THREE.Material).opacity =
        0.06 + Math.sin(state.clock.elapsedTime * 0.3) * 0.02;
    }
  });

  return (
    <>
      <ambientLight intensity={0.15} />
      <pointLight position={[3, 3, 3]} intensity={0.5} color="#38bdf8" />
      <pointLight position={[-3, -2, -3]} intensity={0.3} color="#818cf8" />
      <pointLight position={[0, 4, 0]} intensity={0.2} color="#e0f2fe" />
      <gridHelper
        ref={gridRef}
        args={[4, 20, "#1e3a5f", "#1e3a5f"]}
        position={[0, -1.2, 0]}
        material-transparent
        material-opacity={0.08}
      />
    </>
  );
}

/* ── Main Scene ────────────────────────────────────── */
export default function EmbeddingsScene({
  data,
  onPointHover,
}: {
  data: EmbeddingData;
  onPointHover?: (point: EmbeddingPoint | null) => void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const pointMap = useMemo(() => {
    const m: Record<string, EmbeddingPoint> = {};
    data.points.forEach((p) => (m[p.topic_id] = p));
    return m;
  }, [data.points]);

  const { hoveredPoint, neighborIds, connectedIds } = useMemo(() => {
    if (hoveredIndex === null) return { hoveredPoint: null, neighborIds: new Set<string>(), connectedIds: new Set<string>() };
    const hp = data.points[hoveredIndex];
    const nIds = new Set(hp.neighbors.map((n) => n.topic_id));
    const cIds = new Set<string>();
    data.edges.forEach((e) => {
      if (e.from === hp.topic_id) cIds.add(e.to);
      if (e.to === hp.topic_id) cIds.add(e.from);
    });
    return { hoveredPoint: hp, neighborIds: nIds, connectedIds: cIds };
  }, [hoveredIndex, data]);

  const goalColorMap = useMemo(() => {
    const palette = ["#38bdf8", "#818cf8", "#34d399", "#f472b6", "#fb923c", "#facc15", "#a78bfa", "#22d3ee"];
    const goals = [...new Set(data.points.map((p) => p.goal_id || "default"))];
    const m: Record<string, string> = {};
    goals.forEach((g, i) => (m[g] = palette[i % palette.length]));
    return m;
  }, [data.points]);

  const handleHover = useCallback(
    (i: number) => {
      setHoveredIndex(i);
      onPointHover?.(data.points[i]);
    },
    [data.points, onPointHover]
  );

  const handleUnhover = useCallback(() => {
    setHoveredIndex(null);
    onPointHover?.(null);
  }, [onPointHover]);

  return (
    <Canvas
      camera={{ position: [0, 0.5, 2.5], fov: 50 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
      onPointerMissed={handleUnhover}
    >
      <SceneEnvironment />

      <Edges
        edges={data.edges}
        pointMap={pointMap}
        hoveredId={hoveredPoint?.topic_id ?? null}
        neighborIds={neighborIds}
      />

      {data.points.map((point, i) => (
        <Particle
          key={point.topic_id}
          point={point}
          index={i}
          isHovered={hoveredIndex === i}
          isNeighbor={neighborIds.has(point.topic_id)}
          isConnected={connectedIds.has(point.topic_id)}
          onHover={handleHover}
          onUnhover={handleUnhover}
          goalColorMap={goalColorMap}
        />
      ))}

      {hoveredPoint && <HoverLabel point={hoveredPoint} />}

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        rotateSpeed={0.6}
        zoomSpeed={0.8}
        minDistance={0.8}
        maxDistance={6}
        enablePan={false}
      />
    </Canvas>
  );
}
