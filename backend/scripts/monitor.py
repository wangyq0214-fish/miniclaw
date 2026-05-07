#!/usr/bin/env python3
"""
Agent Workflow Monitor - 实时监控 agent 内部工作流状态

用法:
    python monitor.py                          # 交互式模式
    python monitor.py -m "你的消息"             # 直接发送消息
    python monitor.py --url http://host:port    # 指定后端地址
    python monitor.py -v                        # 显示完整工具输出
    python monitor.py --hide-tokens             # 隐藏流式 token
    python monitor.py --no-color                # 禁用颜色
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from datetime import datetime
from typing import Any, Optional

import httpx


# ============================================================================
# ANSI 颜色定义
# ============================================================================

class Colors:
    """ANSI 颜色代码"""
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"

    # 前景色
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"
    GRAY = "\033[90m"

    # 背景色
    BG_RED = "\033[41m"
    BG_GREEN = "\033[42m"
    BG_BLUE = "\033[44m"

    @classmethod
    def disable(cls):
        """禁用所有颜色"""
        for attr in dir(cls):
            if attr.isupper() and not attr.startswith("_"):
                setattr(cls, attr, "")


# ============================================================================
# SSE 解析器
# ============================================================================

class SSEParser:
    """SSE 流解析器"""

    @staticmethod
    async def parse_stream(response: httpx.Response):
        """解析 SSE 流，yield 事件字典"""
        buffer = ""
        async for chunk in response.aiter_text():
            buffer += chunk
            while "\n\n" in buffer:
                line, buffer = buffer.split("\n\n", 1)
                line = line.strip()
                if line.startswith("data: "):
                    data_str = line[6:]
                    try:
                        event = json.loads(data_str)
                        yield event
                    except json.JSONDecodeError:
                        continue


# ============================================================================
# 工作流追踪器
# ============================================================================

class ToolCall:
    """工具调用记录"""
    def __init__(self, tool: str, tool_id: str, input_data: Any, is_subagent: bool = False):
        self.tool = tool
        self.tool_id = tool_id
        self.input_data = input_data
        self.is_subagent = is_subagent
        self.output: Optional[str] = None
        self.start_time = time.time()
        self.end_time: Optional[float] = None
        self.subagent_name: Optional[str] = None
        self.children_events: list[dict] = []  # 子 Agent 内部事件

    @property
    def duration(self) -> Optional[float]:
        if self.end_time:
            return self.end_time - self.start_time
        return None

    @property
    def input_preview(self) -> str:
        """获取输入预览"""
        if isinstance(self.input_data, dict):
            if self.tool == "task":
                agent_type = self.input_data.get("subagent_type", "")
                return f'{{"agent": "{agent_type}", ...}}'
            return json.dumps(self.input_data, ensure_ascii=False)[:200]
        return str(self.input_data)[:200]

    @property
    def output_preview(self) -> str:
        """获取输出预览"""
        if self.output is None:
            return "(无输出)"
        if len(self.output) > 500:
            return self.output[:500] + "..."
        return self.output


class WorkflowTracker:
    """工作流追踪器"""

    def __init__(self):
        self.reset()

    def reset(self):
        """重置状态"""
        self.main_tokens: list[str] = []  # 主 agent token
        self.tool_calls: dict[str, ToolCall] = {}  # tool_id -> ToolCall
        self.completed_tools: list[ToolCall] = []  # 已完成的工具调用
        self.current_tool_stack: list[str] = []  # 当前工具调用栈（用于嵌套）
        self.subagent_events: dict[str, list[dict]] = {}  # parent_tool_id -> events
        self.status_messages: list[str] = []
        self.start_time = time.time()
        self.end_time: Optional[float] = None
        self.total_tokens = 0
        self.error: Optional[str] = None

    @property
    def duration(self) -> float:
        end = self.end_time or time.time()
        return end - self.start_time

    def add_tool_start(self, tool: str, tool_id: str, input_data: Any):
        """记录工具调用开始"""
        is_subagent = (tool == "task")
        call = ToolCall(tool, tool_id, input_data, is_subagent)
        if is_subagent:
            agent_type = input_data.get("subagent_type", "") if isinstance(input_data, dict) else ""
            call.subagent_name = agent_type
        self.tool_calls[tool_id] = call
        self.current_tool_stack.append(tool_id)

    def add_tool_end(self, tool_id: str, output: str):
        """记录工具调用结束"""
        if tool_id in self.tool_calls:
            call = self.tool_calls[tool_id]
            call.output = output
            call.end_time = time.time()
            self.completed_tools.append(call)
            # 从栈中移除
            if tool_id in self.current_tool_stack:
                self.current_tool_stack.remove(tool_id)
            # 从活跃调用中移除
            del self.tool_calls[tool_id]

    def add_subagent_event(self, event: dict):
        """记录子 Agent 内部事件"""
        # 找到当前正在执行的 task 工具
        for tool_id in reversed(self.current_tool_stack):
            if tool_id in self.tool_calls and self.tool_calls[tool_id].is_subagent:
                self.tool_calls[tool_id].children_events.append(event)
                return

    def add_token(self, content: str):
        """记录 token"""
        self.main_tokens.append(content)
        self.total_tokens += 1

    def add_subagent_token(self, content: str):
        """记录子 Agent token"""
        self.add_subagent_event({"type": "token", "content": content})


# ============================================================================
# 终端渲染器
# ============================================================================

class TerminalRenderer:
    """终端渲染器"""

    def __init__(self, show_tokens: bool = True, verbose: bool = False, log_file: Optional[str] = None):
        self.show_tokens = show_tokens
        self.verbose = verbose
        self.log_file = log_file
        self._log_fp = None
        if log_file:
            self._log_fp = open(log_file, "w", encoding="utf-8")

    def close(self):
        if self._log_fp:
            self._log_fp.close()

    def _write(self, text: str, end: str = "\n"):
        """写入到终端和日志文件"""
        sys.stdout.write(text + end)
        sys.stdout.flush()
        if self._log_fp:
            # 写入日志时去掉 ANSI 颜色
            import re
            clean = re.sub(r"\033\[[0-9;]*m", "", text)
            self._log_fp.write(clean + end)
            self._log_fp.flush()

    def _timestamp(self) -> str:
        """获取时间戳"""
        return datetime.now().strftime("%H:%M:%S")

    def _truncate(self, text: str, max_len: int = 500) -> str:
        """截断文本"""
        if self.verbose:
            return text
        if len(text) > max_len:
            return text[:max_len] + f"... (共 {len(text)} 字符)"
        return text

    def print_header(self, url: str, user_id: str):
        """打印监控头部"""
        width = 60
        self._write(f"{Colors.CYAN}╭{'─' * (width - 2)}╮{Colors.RESET}")
        self._write(f"{Colors.CYAN}│{Colors.RESET} {Colors.BOLD}Agent Monitor{Colors.RESET}{' ' * (width - 16)}{Colors.CYAN}│{Colors.RESET}")
        self._write(f"{Colors.CYAN}│{Colors.RESET} 后端: {Colors.YELLOW}{url}{Colors.RESET}{' ' * (width - 9 - len(url))}{Colors.CYAN}│{Colors.RESET}")
        self._write(f"{Colors.CYAN}│{Colors.RESET} 用户: {Colors.GREEN}{user_id}{Colors.RESET}{' ' * (width - 9 - len(user_id))}{Colors.CYAN}│{Colors.RESET}")
        self._write(f"{Colors.CYAN}╰{'─' * (width - 2)}╯{Colors.RESET}")
        self._write("")

    def print_message_sent(self, message: str):
        """打印发送的消息"""
        ts = self._timestamp()
        preview = message[:80] + ("..." if len(message) > 80 else "")
        self._write(f"{Colors.GRAY}[{ts}]{Colors.RESET} {Colors.BOLD}[SEND] 发送消息:{Colors.RESET} \"{preview}\"")
        self._write("")

    def print_status(self, message: str):
        """打印状态更新"""
        ts = self._timestamp()
        self._write(f"{Colors.GRAY}[{ts}]{Colors.RESET} {Colors.YELLOW}[STATUS] 状态:{Colors.RESET} {message}")

    def print_token(self, content: str):
        """打印流式 token"""
        if not self.show_tokens:
            return
        # token 输出不换行，使用 \r 覆盖
        sys.stdout.write(f"{Colors.GRAY}{content}{Colors.RESET}")
        sys.stdout.flush()

    def print_token_newline(self):
        """token 输出结束后换行"""
        if self.show_tokens:
            self._write("")

    def print_tool_start(self, call: ToolCall, indent: int = 0):
        """打印工具调用开始"""
        ts = self._timestamp()
        prefix = "   " * indent
        icon = "[TOOL]"

        if call.is_subagent:
            self._write(f"{Colors.GRAY}[{ts}]{Colors.RESET} {prefix}{icon} {Colors.CYAN}工具调用:{Colors.RESET} {Colors.BOLD}{call.tool}{Colors.RESET} (子 Agent: {Colors.MAGENTA}{call.subagent_name}{Colors.RESET})")
        else:
            self._write(f"{Colors.GRAY}[{ts}]{Colors.RESET} {prefix}{icon} {Colors.CYAN}工具调用:{Colors.RESET} {Colors.BOLD}{call.tool}{Colors.RESET}")

        # 显示输入
        self._write(f"{Colors.GRAY}           {prefix}├─ 输入:{Colors.RESET}")
        input_str = json.dumps(call.input_data, ensure_ascii=False, indent=2) if isinstance(call.input_data, dict) else str(call.input_data)
        for line in input_str.split("\n"):
            self._write(f"{Colors.GRAY}           {prefix}│  {Colors.RESET}{line}")

    def print_tool_start_header(self, tool: str, tool_id: str, agent_type: str):
        """打印工具调用开始的头部（仅子代理）"""
        ts = self._timestamp()
        self._write(f"{Colors.GRAY}[{ts}]{Colors.RESET} [TOOL] {Colors.CYAN}工具调用:{Colors.RESET} {Colors.BOLD}{tool}{Colors.RESET} (子 Agent: {Colors.MAGENTA}{agent_type}{Colors.RESET})")

    def print_tool_end_output(self, output: str, indent: int = 0):
        """打印工具调用结束的输出"""
        prefix = "   " * indent
        self._write(f"{Colors.GRAY}           {prefix}└─ 输出:{Colors.RESET}")
        output_str = self._truncate(output or "(无输出)")
        for line in output_str.split("\n"):
            self._write(f"{Colors.GRAY}           {prefix}   {Colors.RESET}{line}")
        self._write("")

    def print_tool_end(self, call: ToolCall, indent: int = 0):
        """打印工具调用结束"""
        prefix = "   " * indent
        duration_str = f" (耗时: {call.duration:.1f}s)" if call.duration else ""

        # 显示输出
        self._write(f"{Colors.GRAY}           {prefix}└─ 输出:{Colors.RESET}{Colors.GREEN}{duration_str}{Colors.RESET}")
        output_str = self._truncate(call.output or "(无输出)")
        for line in output_str.split("\n"):
            self._write(f"{Colors.GRAY}           {prefix}   {Colors.RESET}{line}")
        self._write("")

    def print_subagent_start(self, agent_name: str, indent: int = 1):
        """打印子 Agent 开始"""
        prefix = "   " * indent
        width = 50 - len(prefix)
        self._write(f"{Colors.GRAY}           {prefix}{Colors.BLUE}┌─ 子 Agent: {agent_name} {'─' * max(1, width - len(agent_name) - 12)}{Colors.RESET}")

    def print_subagent_end(self, indent: int = 1):
        """打印子 Agent 结束"""
        prefix = "   " * indent
        self._write(f"{Colors.GRAY}           {prefix}{Colors.BLUE}└────────────────────────────────────────────{Colors.RESET}")

    def print_subagent_event(self, event: dict, indent: int = 2):
        """打印子 Agent 内部事件"""
        ts = self._timestamp()
        prefix = "   " * indent
        event_type = event.get("type")

        if event_type == "status":
            self._write(f"{Colors.GRAY}           {prefix}│ [{ts}] {Colors.YELLOW}[STATUS] 状态:{Colors.RESET} {event.get('message', '')}")
        elif event_type == "token":
            if self.show_tokens:
                content = event.get("content", "")
                sys.stdout.write(f"{Colors.GRAY}           {prefix}│ {content}{Colors.RESET}")
                sys.stdout.flush()
        elif event_type == "tool_start":
            tool = event.get("tool", "unknown")
            self._write(f"{Colors.GRAY}           {prefix}│ [{ts}] {Colors.CYAN}[TOOL] 工具调用:{Colors.RESET} {tool}")
            input_data = event.get("input", {})
            if input_data:
                input_str = json.dumps(input_data, ensure_ascii=False)[:200]
                self._write(f"{Colors.GRAY}           {prefix}│            ├─ 输入: {Colors.RESET}{input_str}")
        elif event_type == "tool_end":
            tool = event.get("tool", "unknown")
            output = event.get("output", "")
            output_preview = self._truncate(output, 200)
            self._write(f"{Colors.GRAY}           {prefix}│            └─ 输出: {Colors.RESET}{output_preview}")
        elif event_type == "error":
            self._write(f"{Colors.GRAY}           {prefix}│ [{ts}] {Colors.RED}[ERROR] 错误:{Colors.RESET} {event.get('error', '')}")

    def print_error(self, error: str):
        """打印错误"""
        ts = self._timestamp()
        self._write(f"{Colors.GRAY}[{ts}]{Colors.RESET} {Colors.RED}[ERROR] 错误:{Colors.RESET} {error}")

    def print_done(self, tracker: WorkflowTracker):
        """打印完成信息"""
        ts = self._timestamp()
        duration = tracker.duration

        self._write("")
        self._write(f"{Colors.GRAY}[{ts}]{Colors.RESET} {Colors.GREEN}{Colors.BOLD}[DONE] 完成{Colors.RESET}")
        self._write(f"{Colors.GRAY}           ├─ 总耗时: {duration:.1f}s{Colors.RESET}")

        if tracker.total_tokens > 0:
            self._write(f"{Colors.GRAY}           ├─ Token 数: {tracker.total_tokens}{Colors.RESET}")

        # 显示工具调用统计
        tool_count = len(tracker.completed_tools)
        if tool_count > 0:
            tool_names = [c.tool for c in tracker.completed_tools]
            self._write(f"{Colors.GRAY}           ├─ 工具调用: {tool_count} 次 ({', '.join(tool_names)}){Colors.RESET}")

        # 显示最终回复
        if tracker.main_tokens:
            full_response = "".join(tracker.main_tokens)
            preview = self._truncate(full_response, 300)
            self._write(f"{Colors.GRAY}           └─ 最终回复:{Colors.RESET}")
            for line in preview.split("\n"):
                self._write(f"{Colors.GRAY}              {line}{Colors.RESET}")

        self._write("")

    def print_tool_call_detail(self, call: ToolCall, indent: int = 0):
        """打印完整的工具调用详情（包括子 Agent 事件）"""
        self.print_tool_start(call, indent)

        # 如果是子 Agent，显示内部事件
        if call.is_subagent and call.children_events:
            self.print_subagent_start(call.subagent_name or "unknown", indent + 1)
            for event in call.children_events:
                self.print_subagent_event(event, indent + 1)
            # 子 Agent token 换行
            if self.show_tokens:
                self._write("")
            self.print_subagent_end(indent + 1)

        self.print_tool_end(call, indent)


# ============================================================================
# 监控应用
# ============================================================================

class MonitorApp:
    """监控应用主类"""

    # 默认账号
    DEFAULT_USERNAME = "qin"
    DEFAULT_PASSWORD = "123456"

    def __init__(self, url: str, user_id: str, token: Optional[str] = None,
                 show_tokens: bool = True, verbose: bool = False,
                 no_color: bool = False, log_file: Optional[str] = None):
        self.url = url.rstrip("/")
        self.user_id = user_id
        self.token = token
        self.show_tokens = show_tokens
        self.verbose = verbose

        if no_color:
            Colors.disable()

        self.renderer = TerminalRenderer(show_tokens, verbose, log_file)
        self.tracker = WorkflowTracker()

    async def _ensure_token(self):
        """确保有有效的 token，如果没有则自动登录"""
        if self.token:
            return True

        self.renderer._write(f"{Colors.GRAY}正在自动登录...{Colors.RESET}")
        try:
            # 使用 subprocess 调用 curl 获取 token（更可靠）
            import subprocess
            result = subprocess.run(
                ["curl", "-s", "-X", "POST", f"{self.url}/api/auth/login",
                 "-d", f"username={self.DEFAULT_USERNAME}&password={self.DEFAULT_PASSWORD}"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0 and result.stdout:
                data = json.loads(result.stdout)
                self.token = data.get("access_token")
                if self.token:
                    self.renderer._write(f"{Colors.GREEN}登录成功{Colors.RESET}")
                    return True
                else:
                    self.renderer._write(f"{Colors.RED}登录失败: 响应中没有 access_token{Colors.RESET}")
                    return False
            else:
                self.renderer._write(f"{Colors.RED}登录失败: {result.stderr or '无响应'}{Colors.RESET}")
                return False
        except Exception as e:
            self.renderer._write(f"{Colors.RED}登录失败: {e}{Colors.RESET}")
            return False

    async def send_message(self, message: str, session_id: Optional[str] = None):
        """发送消息并监控响应"""
        # 确保有 token
        if not await self._ensure_token():
            return

        # 生成 session_id
        if not session_id:
            session_id = f"monitor_{int(time.time())}"

        # 重置追踪器
        self.tracker.reset()

        # 打印发送消息
        self.renderer.print_message_sent(message)

        # 准备请求
        payload = json.dumps({
            "message": message,
            "session_id": session_id,
            "stream": True
        }, ensure_ascii=False)

        try:
            # 使用 subprocess 调用 curl 处理 SSE 流
            import subprocess
            process = subprocess.Popen(
                ["curl", "-s", "-N", "-X", "POST", f"{self.url}/api/chat",
                 "-H", "Content-Type: application/json",
                 "-H", "Accept: text/event-stream",
                 "-H", f"Authorization: Bearer {self.token}",
                 "-d", payload],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8"
            )

            buffer = ""
            while True:
                char = process.stdout.read(1)
                if not char:
                    break
                buffer += char
                while "\n\n" in buffer:
                    line, buffer = buffer.split("\n\n", 1)
                    line = line.strip()
                    if line.startswith("data: "):
                        data_str = line[6:]
                        try:
                            event = json.loads(data_str)
                            await self._process_event(event, "")
                        except json.JSONDecodeError:
                            continue

            process.wait()

        except Exception as e:
            self.renderer.print_error(f"未知错误: {e}")

    async def _process_event(self, event: dict, token_buffer: str):
        """处理单个 SSE 事件"""
        event_type = event.get("type")

        if event_type == "status":
            # token 换行（如果有）
            if token_buffer:
                self.renderer.print_token_newline()
                token_buffer = ""
            self.renderer.print_status(event.get("message", ""))

        elif event_type == "token":
            content = event.get("content", "")
            self.tracker.add_token(content)
            self.renderer.print_token(content)

        elif event_type == "tool_start":
            # token 换行（如果有）
            if token_buffer:
                self.renderer.print_token_newline()
                token_buffer = ""

            tool = event.get("tool", "unknown")
            tool_id = event.get("id", "")
            input_data = event.get("input", {})
            self.tracker.add_tool_start(tool, tool_id, input_data)

            # 如果是子代理调用，打印子代理开始
            if tool == "task":
                agent_type = input_data.get("subagent_type", "") if isinstance(input_data, dict) else ""
                self.renderer.print_tool_start_header(tool, tool_id, agent_type)
                self.renderer.print_subagent_start(agent_type)

        elif event_type == "tool_end":
            # token 换行（如果有）
            if token_buffer:
                self.renderer.print_token_newline()
                token_buffer = ""

            tool_id = event.get("id", "")
            output = event.get("output", "")
            self.tracker.add_tool_end(tool_id, output)

            # 找到对应的工具调用并打印详情
            for call in self.tracker.completed_tools:
                if call.tool_id == tool_id:
                    if call.is_subagent:
                        # 子代理结束
                        self.renderer.print_subagent_end()
                        self.renderer.print_tool_end_output(output)
                    else:
                        self.renderer.print_tool_call_detail(call)
                    break

        elif event_type == "subagent_status":
            # 子代理状态更新
            self.renderer.print_subagent_event(event)
            self.tracker.add_subagent_event(event)

        elif event_type == "subagent_token":
            # 子代理 token 输出
            content = event.get("content", "")
            self.renderer.print_subagent_event(event)
            self.tracker.add_subagent_token(content)

        elif event_type == "subagent_tool_start":
            # 子代理工具调用开始
            self.renderer.print_subagent_event(event)
            self.tracker.add_subagent_event(event)

        elif event_type == "subagent_tool_end":
            # 子代理工具调用结束
            self.renderer.print_subagent_event(event)
            self.tracker.add_subagent_event(event)

        elif event_type == "done":
            # token 换行
            if token_buffer:
                self.renderer.print_token_newline()
            self.tracker.end_time = time.time()
            self.renderer.print_done(self.tracker)

        elif event_type == "error":
            error = event.get("error", "未知错误")
            self.tracker.error = error
            self.renderer.print_error(error)

    async def run_interactive(self):
        """交互式模式"""
        self.renderer.print_header(self.url, self.user_id)
        print(f"{Colors.GRAY}输入消息开始监控，输入 'quit' 或 'exit' 退出{Colors.RESET}")
        print(f"{Colors.GRAY}按 Ctrl+C 中断当前响应{Colors.RESET}")
        print("")

        while True:
            try:
                message = input(f"{Colors.GREEN}> {Colors.RESET}").strip()
                if not message:
                    continue
                if message.lower() in ("quit", "exit", "q"):
                    print(f"{Colors.GRAY}再见！{Colors.RESET}")
                    break
                await self.send_message(message)
            except KeyboardInterrupt:
                print(f"\n{Colors.YELLOW}已中断{Colors.RESET}")
                continue
            except EOFError:
                break

    async def run_single(self, message: str):
        """单次模式"""
        self.renderer.print_header(self.url, self.user_id)
        await self.send_message(message)


# ============================================================================
# CLI 入口
# ============================================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description="Agent Workflow Monitor - 实时监控 agent 内部工作流",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
    python monitor.py                          # 交互式模式
    python monitor.py -m "生成 Python 讲义"     # 直接发送消息
    python monitor.py --url http://192.168.1.100:8002  # 指定远程后端
    python monitor.py -v                       # 显示完整工具输出
    python monitor.py --hide-tokens            # 隐藏流式 token
    python monitor.py --log-file monitor.log   # 同时写入日志文件
        """
    )

    parser.add_argument(
        "--url", "-u",
        default="http://localhost:8002",
        help="后端服务地址 (默认: http://localhost:8002)"
    )
    parser.add_argument(
        "--user-id",
        default="monitor_user",
        help="用户 ID (默认: monitor_user)"
    )
    parser.add_argument(
        "--message", "-m",
        help="直接发送消息（非交互式模式）"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="显示完整的工具输出（默认截断到 500 字符）"
    )
    parser.add_argument(
        "--hide-tokens",
        action="store_true",
        help="隐藏流式 token 输出"
    )
    parser.add_argument(
        "--no-color",
        action="store_true",
        help="禁用颜色输出"
    )
    parser.add_argument(
        "--token", "-t",
        help="JWT 认证 token"
    )
    parser.add_argument(
        "--log-file",
        help="同时写入日志文件"
    )

    return parser.parse_args()


async def main():
    args = parse_args()

    app = MonitorApp(
        url=args.url,
        user_id=args.user_id,
        token=args.token,
        show_tokens=not args.hide_tokens,
        verbose=args.verbose,
        no_color=args.no_color,
        log_file=args.log_file
    )

    try:
        if args.message:
            await app.run_single(args.message)
        else:
            await app.run_interactive()
    finally:
        app.renderer.close()


if __name__ == "__main__":
    asyncio.run(main())
