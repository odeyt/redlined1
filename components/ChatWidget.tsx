'use client';

import { useState, useRef, useEffect } from 'react';
import { LOGO_SRC } from '@/lib/logo';

interface Message {
  from: 'bot' | 'user';
  text: string;
  time: string;
}

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'intro' | 'name' | 'email' | 'message' | 'done'>('intro');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { from: 'bot', text: 'Hi there! 👋 Welcome to Redlined1. I\'m here to help. What\'s your name?', time: now() },
  ]);
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(1);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function addMessage(from: 'bot' | 'user', text: string) {
    setMessages(prev => [...prev, { from, text, time: now() }]);
  }

  function handleOpen() {
    setOpen(true);
    setUnread(0);
  }

  async function handleSend() {
    const val = input.trim();
    if (!val) return;
    setInput('');
    addMessage('user', val);

    if (step === 'intro' || step === 'name') {
      setName(val);
      setStep('email');
      setTimeout(() => addMessage('bot', `Nice to meet you, ${val}! What's your email so we can follow up?`), 600);
    } else if (step === 'email') {
      setEmail(val);
      setStep('message');
      setTimeout(() => addMessage('bot', 'Got it! How can we help you today? Describe your question or issue.'), 600);
    } else if (step === 'message') {
      setMessage(val);
      setStep('done');
      setSending(true);
      try {
        await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, message: val }),
        });
        setTimeout(() => {
          addMessage('bot', `Thanks, ${name}! ✅ Your message has been sent to our team. We'll get back to you at ${email || 'the email you provided'} within 1 business day.`);
          setSending(false);
        }, 800);
      } catch {
        setTimeout(() => {
          addMessage('bot', 'Sorry, something went wrong. Please email us directly at sales@d1autozone.com.');
          setSending(false);
        }, 800);
      }
    }
  }

  return (
    <>
      {/* Chat window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 90, right: 24, width: 340, maxHeight: 480,
          background: '#0d0d10', border: '1px solid rgba(204,0,0,0.35)',
          borderRadius: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column', zIndex: 9999,
          overflow: 'hidden', fontFamily: 'system-ui, sans-serif',
        }}>
          {/* Header */}
          <div style={{ background: '#cc0000', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <img src={LOGO_SRC} alt="Redlined1" style={{ height: 34, width: 'auto', objectFit: 'contain' }} />
              <div style={{ position: 'absolute', bottom: 0, right: -2, width: 10, height: 10, borderRadius: '50%', background: '#22c55e', border: '2px solid #cc0000' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>Redlined1 Support</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#86efac', display: 'inline-block' }} />
                Online · Typically replies in minutes
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
                {m.from === 'bot' && (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#cc0000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>🔧</div>
                )}
                <div>
                  <div style={{
                    background: m.from === 'bot' ? 'rgba(255,255,255,0.07)' : '#cc0000',
                    color: '#fff', padding: '9px 13px', borderRadius: m.from === 'bot' ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
                    fontSize: 13, lineHeight: 1.5, maxWidth: 220,
                  }}>{m.text}</div>
                  <div style={{ fontSize: 10, color: '#555', marginTop: 3, textAlign: m.from === 'user' ? 'right' : 'left' }}>{m.time}</div>
                </div>
              </div>
            ))}
            {sending && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#cc0000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🔧</div>
                <div style={{ background: 'rgba(255,255,255,0.07)', padding: '9px 14px', borderRadius: '16px 16px 16px 4px', display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#555', display: 'inline-block', animation: `bounce 1.2s ${i*0.2}s infinite` }} />)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          {step !== 'done' && (
            <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8 }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={step === 'intro' || step === 'name' ? 'Your name…' : step === 'email' ? 'Your email…' : 'Type your message…'}
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, padding: '9px 12px', color: '#fff', fontSize: 13,
                  outline: 'none',
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                style={{
                  background: input.trim() ? '#cc0000' : '#333', border: 'none', borderRadius: 10,
                  width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: input.trim() ? 'pointer' : 'default', flexShrink: 0, fontSize: 16,
                }}
              >➤</button>
            </div>
          )}
          <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }`}</style>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={handleOpen}
        style={{
          position: 'fixed', bottom: 24, right: 24, width: 58, height: 58,
          borderRadius: '50%', background: '#cc0000', border: 'none',
          boxShadow: '0 4px 24px rgba(204,0,0,0.55)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, zIndex: 9999, transition: 'transform 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        title="Chat with us"
      >
        {open ? '✕' : '💬'}
        {!open && unread > 0 && (
          <div style={{
            position: 'absolute', top: 2, right: 2, width: 18, height: 18,
            borderRadius: '50%', background: '#22c55e', border: '2px solid #cc0000',
            fontSize: 10, fontWeight: 800, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{unread}</div>
        )}
      </button>
    </>
  );
}
