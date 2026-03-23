import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageCircle, Send, ArrowLeft, Plus, Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface Conversation {
  id: string;
  type: 'direct' | 'team';
  teamName?: string;
  otherUser?: { id: string; display_name: string; avatar_url: string | null } | null;
  lastMessage?: { content: string; created_at: string } | null;
  unreadCount: number;
}

interface Message {
  id: number;
  content: string;
  sender_id: string;
  created_at: string;
  isMine: boolean;
  sender?: { display_name: string; avatar_url: string | null } | null;
}

export default function MessagesPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; display_name: string; email?: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    // Search profiles by display_name
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name')
      .neq('id', user?.id || '')
      .ilike('display_name', `%${query}%`)
      .limit(10);
    setSearchResults((data || []) as any);
    setSearching(false);
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => searchUsers(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchUsers]);

  const fetchConversations = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/conversations', { headers: { 'Authorization': `Bearer ${session.access_token}` } });
    const data = await res.json();
    setConversations(data.conversations || []);
    setLoading(false);
  }, []);

  const startDM = useCallback(async (targetUserId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ userId: targetUserId, type: 'direct' }),
    });
    const data = await res.json();
    if (data.conversation) {
      setShowNewChat(false);
      setSearchQuery('');
      setSearchResults([]);
      await fetchConversations();
      const conv: Conversation = {
        id: data.conversation.id,
        type: 'direct',
        otherUser: searchResults.find(u => u.id === targetUserId) as any,
        lastMessage: null,
        unreadCount: 0,
      };
      setSelectedConv(conv);
    }
  }, [fetchConversations, searchResults]);

  const fetchMessages = useCallback(async (convId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`/api/conversations/${convId}/messages`, { headers: { 'Authorization': `Bearer ${session.access_token}` } });
    const data = await res.json();
    setMessages(data.messages || []);
    await fetch(`/api/conversations/${convId}/read`, { method: 'PUT', headers: { 'Authorization': `Bearer ${session.access_token}` } });
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);
  useEffect(() => { if (selectedConv) fetchMessages(selectedConv.id); }, [selectedConv, fetchMessages]);

  useEffect(() => {
    if (!selectedConv) return;
    const channel = supabase.channel(`messages:${selectedConv.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConv.id}` }, (payload) => {
        const m = payload.new as any;
        if (m.sender_id === user?.id) return;
        setMessages(prev => [...prev, { ...m, isMine: false }]);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedConv, user]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = useCallback(async () => {
    if (!newMsg.trim() || !selectedConv) return;
    const content = newMsg.trim();
    setNewMsg('');
    setSending(true);

    const optimisticMsg: Message = {
      id: Date.now(),
      content,
      sender_id: user?.id || '',
      created_at: new Date().toISOString(),
      isMine: true,
      sender: { display_name: 'Me', avatar_url: null },
    };
    setMessages(prev => [...prev, optimisticMsg]);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSending(false); return; }
    await fetch(`/api/conversations/${selectedConv.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ content }),
    });
    setSending(false);
    inputRef.current?.focus();
  }, [newMsg, selectedConv, user]);

  const getConvName = (conv: Conversation) => {
    if (conv.type === 'team') return conv.teamName || '팀 채팅';
    return conv.otherUser?.display_name || '대화';
  };

  const getConvInitial = (conv: Conversation) => {
    if (conv.type === 'team') return '팀';
    return conv.otherUser?.display_name?.[0]?.toUpperCase() || '?';
  };

  // ---- Render helpers (not components, just JSX) ----

  const convListContent = (
    <>
      <div className="bg-gray-800 border-b border-gray-700 shrink-0 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-5 h-5 text-blue-400" />
          <h1 className="text-white font-semibold text-sm md:text-base">메시지</h1>
        </div>
        <button
          onClick={() => setShowNewChat(true)}
          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg cursor-pointer active:bg-gray-600"
          title="새 대화"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center text-gray-500 py-12 px-4">
            <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">대화가 없습니다</p>
            <p className="text-xs mt-1">커뮤니티에서 다른 유저에게 메시지를 보내보세요!</p>
          </div>
        ) : conversations.map(conv => (
          <button
            key={conv.id}
            onClick={() => setSelectedConv(conv)}
            className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-700/50 cursor-pointer text-left transition-colors ${
              selectedConv?.id === conv.id ? 'bg-gray-700/50' : 'hover:bg-gray-800/50 active:bg-gray-800'
            }`}
          >
            <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-sm text-gray-400 shrink-0">
              {getConvInitial(conv)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-sm text-white font-medium truncate">{getConvName(conv)}</p>
                {conv.lastMessage && (
                  <span className="text-[10px] text-gray-600 shrink-0 ml-2">
                    {new Date(conv.lastMessage.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 truncate">{conv.lastMessage?.content || '대화 시작'}</p>
                {conv.unreadCount > 0 && (
                  <span className="ml-2 w-5 h-5 bg-blue-600 text-white text-[10px] rounded-full flex items-center justify-center shrink-0">
                    {conv.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );

  const msgThreadContent = !selectedConv ? (
    <div className="flex-1 flex items-center justify-center text-gray-600">
      <p className="text-sm">대화를 선택해주세요</p>
    </div>
  ) : (
    <>
      <div className="bg-gray-800 border-b border-gray-700 shrink-0 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setSelectedConv(null)} className="md:hidden p-1 text-gray-400 hover:text-white cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-white font-semibold text-sm">{getConvName(selectedConv)}</h1>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.isMine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] md:max-w-[60%] px-3 py-2 rounded-2xl text-sm ${
              msg.isMine ? 'bg-blue-600 text-white rounded-br-md' : 'bg-gray-800 text-gray-200 rounded-bl-md border border-gray-700'
            }`}>
              {!msg.isMine && selectedConv.type === 'team' && (
                <p className="text-[10px] text-gray-400 mb-0.5">{msg.sender?.display_name}</p>
              )}
              <p className="break-words">{msg.content}</p>
              <p className={`text-[9px] mt-0.5 ${msg.isMine ? 'text-blue-200' : 'text-gray-500'}`}>
                {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="bg-gray-800 border-t border-gray-700 px-4 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={newMsg}
            onChange={e => setNewMsg(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="메시지 입력..."
            className="flex-1 bg-gray-900 border border-gray-600 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!newMsg.trim() || sending}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="h-full bg-gray-900 text-gray-200 flex flex-col md:flex-row overflow-hidden">
      {/* Mobile: show list or thread */}
      {selectedConv ? (
        <div className="md:hidden flex flex-col h-full pb-20">{msgThreadContent}</div>
      ) : (
        <div className="md:hidden flex flex-col h-full pb-20">{convListContent}</div>
      )}

      {/* Desktop: side-by-side */}
      <div className="hidden md:flex md:flex-col w-80 border-r border-gray-700 h-full">{convListContent}</div>
      <div className="hidden md:flex md:flex-col flex-1 h-full">{msgThreadContent}</div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => { setShowNewChat(false); setSearchQuery(''); setSearchResults([]); }}>
          <div className="bg-gray-800 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-sm">새 대화</h3>
              <button onClick={() => { setShowNewChat(false); setSearchQuery(''); setSearchResults([]); }} className="p-1 text-gray-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="이름으로 검색..."
                autoFocus
                className="w-full bg-gray-900 border border-gray-600 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {searching && (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                <p className="text-center text-gray-500 text-xs py-4">검색 결과가 없습니다</p>
              )}
              {!searching && searchQuery.length < 2 && searchQuery.length > 0 && (
                <p className="text-center text-gray-500 text-xs py-4">2글자 이상 입력해주세요</p>
              )}
              {!searching && searchQuery.length === 0 && (
                <p className="text-center text-gray-500 text-xs py-4">대화할 유저의 이름을 검색하세요</p>
              )}
              {searchResults.map(u => (
                <button
                  key={u.id}
                  onClick={() => startDM(u.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-700/50 active:bg-gray-700 cursor-pointer text-left"
                >
                  <div className="w-9 h-9 bg-gray-700 rounded-full flex items-center justify-center text-xs text-gray-400">
                    {u.display_name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="text-sm text-white">{u.display_name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
