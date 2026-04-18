'use client';

import { useState, useEffect } from 'react';
import { MonacoEditor } from '@/components/editor/MonacoEditor';
import { FileText, Brain, Wrench, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readFile, writeFile, listSkills } from '@/lib/api';

interface InspectorProps {
  activeTab: 'chat' | 'memory' | 'skills';
  sessionId: string;
}

interface SkillInfo {
  name: string;
  description: string;
  location: string;
}

export function Inspector({ activeTab, sessionId }: InspectorProps) {
  const [content, setContent] = useState('');
  const [currentFile, setCurrentFile] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);

  // Load file content when tab changes
  useEffect(() => {
    const loadFile = async () => {
      let filePath = '';

      if (activeTab === 'memory') {
        filePath = 'memory/MEMORY.md';
      } else if (activeTab === 'skills' && selectedSkill) {
        // Find skill location
        const skill = skills.find((s) => s.name === selectedSkill);
        if (skill) {
          filePath = skill.location.replace('./backend/', '');
        }
      }

      if (filePath) {
        setIsLoading(true);
        try {
          const result = await readFile(filePath);
          setContent(result.content);
          setCurrentFile(filePath);
          setHasChanges(false);
        } catch (error) {
          console.error('Failed to load file:', error);
          setContent('');
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadFile();
  }, [activeTab, selectedSkill, skills]);

  // Load skills list
  useEffect(() => {
    if (activeTab === 'skills') {
      listSkills()
        .then(setSkills)
        .catch(console.error);
    }
  }, [activeTab]);

  const handleSave = async (value: string) => {
    if (currentFile) {
      setIsLoading(true);
      try {
        await writeFile(currentFile, value);
        setHasChanges(false);
      } catch (error) {
        console.error('Failed to save file:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleChange = (value: string) => {
    setContent(value);
    setHasChanges(true);
  };

  const getIcon = () => {
    switch (activeTab) {
      case 'memory':
        return <Brain className="w-4 h-4" />;
      case 'skills':
        return <Wrench className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <div className="h-full flex flex-col border-l border-gray-200/50 bg-white/50">
      {/* File Tabs */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-200/50 bg-gray-50/50">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
        >
          {getIcon()}
          <span>{currentFile.split('/').pop() || '未选择文件'}</span>
          {hasChanges && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
        </Button>
      </div>

      {/* Skills List (when in skills tab) */}
      {activeTab === 'skills' && (
        <div className="border-b border-gray-200/50 p-2">
          <div className="text-xs text-gray-500 mb-2">技能列表</div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {skills.map((skill) => (
              <button
                key={skill.name}
                onClick={() => setSelectedSkill(skill.name)}
                className={`w-full text-left px-2 py-1 rounded text-sm transition-colors ${
                  selectedSkill === skill.name
                    ? 'bg-blue-100 text-blue-700'
                    : 'hover:bg-gray-100'
                }`}
              >
                {skill.name}
              </button>
            ))}
            {skills.length === 0 && (
              <div className="text-xs text-gray-400">暂无技能</div>
            )}
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}
        {activeTab === 'chat' ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>选择"记忆"或"技能"标签查看文件</p>
            </div>
          </div>
        ) : activeTab === 'skills' && !selectedSkill ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Wrench className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>从上方列表选择一个技能</p>
            </div>
          </div>
        ) : (
          <MonacoEditor
            value={content}
            onChange={handleChange}
            onSave={handleSave}
            title={currentFile}
          />
        )}
      </div>
    </div>
  );
}
