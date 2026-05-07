'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/lib/store';
import usePetStore from './usePetStore';

const TOOL_LABELS = {
  read_file: '查阅资料中...',
  write_file: '保存文件中...',
  generate_lecture: '生成讲义中...',
  generate_exercises: '出练习题中...',
  generate_mindmap: '绘制思维导图...',
  generate_code_case: '编写代码案例...',
  generate_reading_list: '整理阅读清单...',
  generate_media_script: '撰写视频脚本...',
  generate_manim_video: '渲染教学视频...',
  get_entity_graph: '查询知识图谱...',
};

export default function useAgentSync() {
  const { state } = useApp();
  const setAgentState = usePetStore((s) => s.setAgentState);
  const setStatusText = usePetStore((s) => s.setStatusText);
  const resetToIdle = usePetStore((s) => s.resetToIdle);
  const prevStreaming = useRef(state.isStreaming);

  useEffect(() => {
    if (state.isStreaming) {
      const lastMsg = [...state.messages].reverse().find((m) => m.role === 'assistant');
      if (!lastMsg) return;

      const toolCalls = lastMsg.toolCalls || [];
      const statusMsgs = lastMsg.statusMessages || [];

      // Find the most recent running tool
      const runningTool = [...toolCalls].reverse().find((tc) => tc.status === 'running');

      if (runningTool) {
        setAgentState('working');
        setStatusText(TOOL_LABELS[runningTool.tool] || `${runningTool.tool}...`);
      } else if (toolCalls.length > 0) {
        // Has tool calls but none running — between tasks
        setAgentState('working');
        setStatusText('处理中...');
      } else {
        // No tool calls yet — thinking / dispatching
        setAgentState('dispatching');
        // Use last status message if available
        const lastStatus = statusMsgs[statusMsgs.length - 1];
        setStatusText(lastStatus?.message || '思考中...');
      }
    } else if (prevStreaming.current && !state.isStreaming) {
      setAgentState('success');
      setStatusText('完成啦！');
      resetToIdle();
    }

    prevStreaming.current = state.isStreaming;
  }, [state.isStreaming, state.messages, setAgentState, setStatusText, resetToIdle]);
}
