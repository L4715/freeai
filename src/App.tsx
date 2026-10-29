import React, { useState } from 'react';

export default function App() {
  const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('deepseek-chat');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    
    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: newMessages })
      });

      if (!response.body) throw new Error("连接失败");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiResponse = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        aiResponse += chunk;
        
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1].content = aiResponse;
          return updated;
        });
      }
    } catch (err: any) {
      alert("错误: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4">
      <header className="flex justify-between items-center py-4 border-b">
        <h1 className="text-xl font-bold">OmniFlare AI Gateway</h1>
        <select 
          value={model} 
          onChange={(e) => setModel(e.target.value)}
          className="border p-2 rounded bg-white"
        >
          <option value="deepseek-chat">DeepSeek-V3</option>
          <option value="gpt-4o-mini">OpenAI GPT-4o-mini</option>
          <option value="gemini-1.5-flash">Google Gemini 1.5 Flash</option>  {/* <-- 加这行 */}
        </select>
      </header>

      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-gray-400 text-center mt-20">可以在下方直接发起提问</div>
        )}
        {messages.map((m, idx) => (
          <div key={idx} className={`p-4 rounded-lg ${m.role === 'user' ? 'bg-blue-100 ml-12' : 'bg-gray-100 mr-12'}`}>
            <span className="font-bold">{m.role === 'user' ? '你' : 'AI'}:</span>
            <div className="mt-1 whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
        {loading && <div className="text-gray-400">正在思考并流式返回...</div>}
      </div>

      <div className="flex gap-2 py-4 border-t">
        <input
          type="text"
          className="flex-1 border p-2 rounded"
          placeholder="输入您的问题..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button 
          onClick={sendMessage} 
          disabled={loading}
          className="bg-black text-white px-6 py-2 rounded hover:bg-gray-800 disabled:opacity-50"
        >
          发送
        </button>
      </div>
    </div>
  );
}
