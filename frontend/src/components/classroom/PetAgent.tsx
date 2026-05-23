'use client';

import { motion } from 'framer-motion';

interface PetAgentProps {
  status: 'thinking' | 'speaking' | 'waiting' | 'done';
}

const statusEmojis = {
  thinking: '🤔',
  speaking: '💬',
  waiting: '👂',
  done: '✨'
};

export default function PetAgent({ status }: PetAgentProps) {
  return (
    <motion.div
      className="absolute bottom-24 left-12 w-32 h-32 bg-white rounded-3xl shadow-xl flex items-center justify-center border border-slate-100"
      animate={{
        scale: [1, 1.05, 1],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut'
      }}
      whileHover={{ scale: 1.1 }}
    >
      <motion.div
        className="text-6xl"
        animate={{
          rotate: status === 'speaking' ? [0, 10, -10, 0] : 0
        }}
        transition={{
          duration: 0.5,
          repeat: status === 'speaking' ? Infinity : 0
        }}
      >
        {statusEmojis[status]}
      </motion.div>
    </motion.div>
  );
}
