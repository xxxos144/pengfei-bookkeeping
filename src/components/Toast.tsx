import { useState, useEffect, useCallback } from 'react';
import type { ToastMessage, ToastType } from '../types';
import { registerToastHandler } from '../utils/toast';
import './Toast.css';

export default function Toast() {
  const [messages, setMessages] = useState<readonly ToastMessage[]>([]);

  const addMessage = useCallback(
    (
      message: string,
      type: ToastType,
      onConfirm?: () => void,
      onCancel?: () => void
    ) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newMsg: ToastMessage = { id, message, type, onConfirm, onCancel };
      setMessages((prev) => [...prev, newMsg]);

      if (type !== 'confirm') {
        setTimeout(() => {
          setMessages((prev) => prev.filter((m) => m.id !== id));
        }, 3000);
      }
    },
    []
  );

  useEffect(() => {
    registerToastHandler(addMessage);
  }, [addMessage]);

  const handleConfirm = (msg: ToastMessage) => {
    msg.onConfirm?.();
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
  };

  const handleCancel = (msg: ToastMessage) => {
    msg.onCancel?.();
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
  };

  if (messages.length === 0) return null;

  return (
    <div className="toast-container">
      {messages.map((msg) => (
        <div key={msg.id} className={`toast toast-${msg.type}`}>
          <span className="toast-message">{msg.message}</span>
          {msg.type === 'confirm' && (
            <div className="toast-actions">
              <button
                className="toast-btn toast-btn-confirm"
                onClick={() => handleConfirm(msg)}
              >
                确认
              </button>
              <button
                className="toast-btn toast-btn-cancel"
                onClick={() => handleCancel(msg)}
              >
                取消
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
