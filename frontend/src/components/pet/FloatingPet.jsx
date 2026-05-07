'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import usePetStore from './usePetStore';

// Sprite rows that play well as one-shot reactions
const REACTION_ROWS = ['wave', 'jump', 'fail', 'interact', 'interact2', 'runLeft', 'runRight'];

// Drag direction → sprite row
const DRAG_DIRECTION_MAP = {
  right: 'runRight',
  left: 'runLeft',
  up: 'jump',
  down: 'fail',
};

export default function FloatingPet() {
  const { isVisible, skin, agentState, statusText, init } = usePetStore();

  useEffect(() => { init(); }, [init]);

  // 移动端不渲染宠物，减少卡顿
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!isVisible || !skin || isMobile) return null;

  return <PetSprite key={skin.id} skin={skin} agentState={agentState} statusText={statusText} />;
}

function PetSprite({ skin, agentState, statusText }) {
  const spriteRowKey = skin.agentStateMap[agentState] || 'idle';
  const spriteRow = skin.rowMap[spriteRowKey];
  const fps = skin.fps[spriteRowKey] || 6;

  const [frame, setFrame] = useState(0);
  const [activeRowKey, setActiveRowKey] = useState(null); // null = agent-driven
  const [isDragging, setIsDragging] = useState(false);
  const pointerStart = useRef({ x: 0, y: 0 });
  const constraintRef = useRef(null);
  const [constraints, setConstraints] = useState({ left: 0, top: 0, right: 0, bottom: 0 });
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Determine which row to display
  const displayRowKey = activeRowKey || spriteRowKey;
  const displayRow = skin.rowMap[displayRowKey];
  const displayFps = activeRowKey ? (skin.fps[activeRowKey] || 6) : fps;

  const { frameWidth, frameHeight, rows, cols } = skin.grid;
  const displaySize = skin.size;
  const displayH = Math.round(displaySize * (frameHeight / frameWidth));

  // Frame animation
  useEffect(() => {
    setFrame(0);
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % displayRow.frames);
    }, 1000 / displayFps);
    return () => clearInterval(timer);
  }, [displayRowKey, displayRow.frames, displayFps]);

  // Screen-edge constraints
  useEffect(() => {
    function update() {
      setConstraints({
        left: -window.innerWidth + displaySize,
        top: -window.innerHeight + displayH,
        right: 0,
        bottom: 0,
      });
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [displaySize, displayH]);

  // Restore saved position
  useEffect(() => {
    try {
      const stored = localStorage.getItem('miniclaw_pet_pos');
      if (stored) {
        const pos = JSON.parse(stored);
        x.set(pos.x);
        y.set(pos.y);
      }
    } catch { /* ignore */ }
  }, [x, y]);

  // Map drag direction to sprite row
  const handleDrag = useCallback((_, info) => {
    const dx = info.delta.x;
    const dy = info.delta.y;
    if (dx === 0 && dy === 0) return;

    let dir;
    if (Math.abs(dx) >= Math.abs(dy)) {
      dir = dx > 0 ? 'right' : 'left';
    } else {
      dir = dy > 0 ? 'down' : 'up';
    }
    const rowKey = DRAG_DIRECTION_MAP[dir];
    if (rowKey && skin.rowMap[rowKey] && rowKey !== activeRowKey) {
      setActiveRowKey(rowKey);
    }
  }, [activeRowKey, skin]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setActiveRowKey(null);
    try {
      localStorage.setItem('miniclaw_pet_pos', JSON.stringify({ x: x.get(), y: y.get() }));
    } catch { /* ignore */ }
  }, [x, y]);

  // Click detection: pointer down/up without significant movement = click
  const handlePointerDown = useCallback((e) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
    setIsDragging(false);
  }, []);

  const handlePointerUp = useCallback((e) => {
    const dx = Math.abs(e.clientX - pointerStart.current.x);
    const dy = Math.abs(e.clientY - pointerStart.current.y);
    if (dx < 5 && dy < 5 && !isDragging) {
      // It's a click — play random reaction
      const candidates = REACTION_ROWS.filter((k) => k !== displayRowKey && skin.rowMap[k]);
      if (candidates.length > 0) {
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        setActiveRowKey(picked);
        // Play the animation once then revert
        const duration = (skin.rowMap[picked].frames / (skin.fps[picked] || 6)) * 1000 + 200;
        setTimeout(() => setActiveRowKey(null), duration);
      }
    }
  }, [displayRowKey, isDragging, skin]);

  return (
    <div ref={constraintRef} className="pointer-events-none fixed inset-0" style={{ zIndex: 99999 }}>
      <motion.div
        className="pointer-events-auto cursor-pointer"
        drag
        dragConstraints={constraints}
        dragElastic={0.08}
        dragMomentum={false}
        onDragStart={() => setIsDragging(true)}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        style={{
          x,
          y,
          position: 'absolute',
          right: 24,
          bottom: 24,
          width: displaySize,
          height: displayH,
        }}
        whileDrag={{ scale: 1.08 }}
        title={skin.name}
      >
        {/* Speech bubble */}
        {statusText && (
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <div className="bg-background/90 backdrop-blur-sm text-[10px] text-foreground/80 px-2 py-0.5 rounded-full border border-border/50 shadow-sm">
              {statusText}
            </div>
            <div className="w-1.5 h-1.5 bg-background/90 border-b border-r border-border/50 rotate-45 mx-auto -mt-0.5" />
          </div>
        )}
        <div
          style={{
            width: displaySize,
            height: displayH,
            backgroundImage: `url(${skin.src})`,
            backgroundSize: `${displaySize * cols}px ${displayH * rows}px`,
            backgroundPosition: `-${frame * displaySize}px -${displayRow.row * displayH}px`,
            backgroundRepeat: 'no-repeat',
          }}
        />
      </motion.div>
    </div>
  );
}
