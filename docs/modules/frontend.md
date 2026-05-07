# Frontend 模块

## 职责
Next.js 16 + React 19 前端应用，提供聊天界面、资源浏览、用户认证。

## 技术栈
- **框架**: Next.js 16.2.3 (App Router)
- **UI库**: React 19.2.4
- **样式**: Tailwind CSS 4
- **状态管理**: React Context + Zustand
- **Markdown**: react-markdown + rehype/remark插件
- **代码高亮**: Shiki
- **图表**: Mermaid + Markmap (思维导图)
- **数学公式**: KaTeX

## 目录结构
```
frontend/src/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # 根布局
│   ├── page.tsx            # 首页（聊天界面）
│   └── login/
│       └── page.tsx        # 登录页
├── components/
│   ├── chat/               # 聊天组件
│   │   ├── ChatView.tsx    # 主聊天视图
│   │   ├── ComposerInput.tsx  # 输入框
│   │   ├── MarkdownRenderer.tsx  # Markdown渲染
│   │   ├── CodeBlock.tsx   # 代码块
│   │   ├── MermaidBlock.tsx  # Mermaid图表
│   │   └── AnimationBlock.tsx  # 动画展示
│   ├── layout/
│   │   └── Sidebar.tsx     # 侧边栏（会话列表）
│   └── inspector/
│       ├── WorkspaceBrowser.tsx  # 工作区浏览器
│       ├── StudentProfileCard.tsx  # 学生画像卡片
│       └── MindmapCard.tsx  # 思维导图卡片
└── lib/
    ├── api.ts              # API客户端
    ├── store.tsx           # 全局状态
    └── auth.ts             # 认证逻辑
```

## 核心组件

### 1. ChatView (聊天视图)
```tsx
export default function ChatView() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  
  const sendMessage = async () => {
    setIsStreaming(true)
    
    // SSE流式接收
    const eventSource = new EventSource(
      `/api/chat?message=${encodeURIComponent(input)}&session_id=${sessionId}`
    )
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      switch (data.type) {
        case 'token':
          // 追加文本token
          appendToken(data.content)
          break
        case 'tool_start':
          // 显示工具调用开始
          addToolCall(data.tool, data.input)
          break
        case 'tool_end':
          // 显示工具调用结果
          updateToolCall(data.id, data.output)
          break
        case 'done':
          // 流结束
          eventSource.close()
          setIsStreaming(false)
          break
      }
    }
  }
  
  return (
    <div className="flex flex-col h-screen">
      <MessageList messages={messages} />
      <ComposerInput 
        value={input}
        onChange={setInput}
        onSend={sendMessage}
        disabled={isStreaming}
      />
    </div>
  )
}
```

### 2. MarkdownRenderer (Markdown渲染)
```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeSanitize from 'rehype-sanitize'

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex, rehypeSanitize]}
      components={{
        code: CodeBlock,
        pre: ({ children }) => <>{children}</>,
        // 自定义其他组件
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
```

### 3. CodeBlock (代码块)
```tsx
import { codeToHtml } from 'shiki'

export async function CodeBlock({ 
  children, 
  className 
}: { 
  children: string
  className?: string 
}) {
  const language = className?.replace('language-', '') || 'text'
  
  const html = await codeToHtml(children, {
    lang: language,
    theme: 'github-dark'
  })
  
  return (
    <div className="relative">
      <button 
        onClick={() => navigator.clipboard.writeText(children)}
        className="absolute top-2 right-2"
      >
        复制
      </button>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
```

### 4. Sidebar (侧边栏)
```tsx
export function Sidebar() {
  const [sessions, setSessions] = useState<Session[]>([])
  
  useEffect(() => {
    loadSessions()
  }, [])
  
  const loadSessions = async () => {
    const response = await fetch('/api/sessions')
    const data = await response.json()
    setSessions(data.sessions)
  }
  
  const createNewSession = async () => {
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '新对话' })
    })
    const newSession = await response.json()
    setSessions([newSession, ...sessions])
  }
  
  return (
    <aside className="w-64 bg-gray-900 p-4">
      <button onClick={createNewSession}>
        + 新对话
      </button>
      <div className="mt-4 space-y-2">
        {sessions.map(session => (
          <SessionItem key={session.id} session={session} />
        ))}
      </div>
    </aside>
  )
}
```

## API客户端

### lib/api.ts
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8002'

export class APIClient {
  private token: string | null = null
  
  setToken(token: string) {
    this.token = token
    localStorage.setItem('token', token)
  }
  
  async request(endpoint: string, options: RequestInit = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    }
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    })
    
    if (response.status === 401) {
      // Token过期，跳转登录
      window.location.href = '/login'
      throw new Error('Unauthorized')
    }
    
    return response.json()
  }
  
  // 聊天（SSE流式）
  streamChat(message: string, sessionId: string): EventSource {
    const url = `${API_BASE}/api/chat?message=${encodeURIComponent(message)}&session_id=${sessionId}`
    return new EventSource(url)
  }
  
  // 获取会话列表
  async getSessions() {
    return this.request('/api/sessions')
  }
  
  // 创建会话
  async createSession(title: string) {
    return this.request('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title })
    })
  }
  
  // 登录
  async login(username: string, password: string) {
    const response = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })
    this.setToken(response.access_token)
    return response
  }
}

export const apiClient = new APIClient()
```

## 状态管理

### lib/store.tsx
```typescript
import { create } from 'zustand'

interface ChatStore {
  currentSessionId: string
  messages: Message[]
  isStreaming: boolean
  
  setCurrentSession: (id: string) => void
  addMessage: (message: Message) => void
  appendToken: (token: string) => void
  setStreaming: (streaming: boolean) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  currentSessionId: 'main_session',
  messages: [],
  isStreaming: false,
  
  setCurrentSession: (id) => set({ currentSessionId: id, messages: [] }),
  
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),
  
  appendToken: (token) => set((state) => {
    const messages = [...state.messages]
    const lastMessage = messages[messages.length - 1]
    if (lastMessage && lastMessage.role === 'assistant') {
      lastMessage.content += token
    } else {
      messages.push({ role: 'assistant', content: token })
    }
    return { messages }
  }),
  
  setStreaming: (streaming) => set({ isStreaming: streaming })
}))
```

## 认证流程

### lib/auth.ts
```typescript
export async function login(username: string, password: string) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  
  if (!response.ok) {
    throw new Error('登录失败')
  }
  
  const data = await response.json()
  localStorage.setItem('token', data.access_token)
  return data
}

export function getToken(): string | null {
  return localStorage.getItem('token')
}

export function logout() {
  localStorage.removeItem('token')
  window.location.href = '/login'
}

export async function getCurrentUser() {
  const token = getToken()
  if (!token) return null
  
  const response = await fetch('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  
  if (!response.ok) {
    logout()
    return null
  }
  
  return response.json()
}
```

## 样式系统

### Tailwind配置
```javascript
// tailwind.config.js
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        secondary: '#8b5cf6',
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            code: {
              backgroundColor: '#1f2937',
              padding: '0.2em 0.4em',
              borderRadius: '0.25rem',
            }
          }
        }
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
}
```

## 性能优化

### 1. 代码分割
```tsx
import dynamic from 'next/dynamic'

// 动态导入重组件
const MermaidBlock = dynamic(() => import('./MermaidBlock'), {
  loading: () => <div>加载中...</div>,
  ssr: false
})
```

### 2. 图片优化
```tsx
import Image from 'next/image'

<Image
  src="/static/knowledge/image.png"
  alt="描述"
  width={800}
  height={600}
  loading="lazy"
/>
```

### 3. 虚拟滚动
```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

function MessageList({ messages }) {
  const parentRef = useRef<HTMLDivElement>(null)
  
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
  })
  
  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(item => (
          <div key={item.key} style={{ transform: `translateY(${item.start}px)` }}>
            <MessageItem message={messages[item.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

## 常见问题

### Q1: SSE连接断开
- 检查Nginx超时配置
- 添加心跳机制
- 自动重连逻辑

### Q2: Markdown渲染慢
- 使用React.memo缓存组件
- 分块渲染长文档
- 延迟加载代码高亮

### Q3: 状态更新卡顿
- 使用useTransition降低优先级
- 防抖输入事件
- 虚拟化长列表
