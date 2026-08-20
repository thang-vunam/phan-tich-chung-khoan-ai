import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';
import { ChatBubbleLeftEllipsisIcon } from './IconComponents';

// Message bubble component
const ChatMessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const isUser = message.role === 'user';
    const bubbleClasses = isUser
        ? 'bg-blue-600 text-white self-end'
        : 'bg-gray-700 text-gray-200 self-start';

    return (
        <div className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-2xl w-fit rounded-xl px-4 py-3 ${bubbleClasses}`}>
                 {message.role === 'model' ? (
                    <div
                        className="prose prose-invert prose-sm sm:prose-base max-w-none"
                        dangerouslySetInnerHTML={{ __html: message.content }}
                    />
                ) : (
                    <p>{message.content}</p>
                )}
            </div>
        </div>
    );
};

// Loading bubble component
const LoadingBubble: React.FC = () => (
    <div className="w-full flex justify-start">
        <div className="max-w-2xl w-fit rounded-xl px-4 py-3 bg-gray-700 text-gray-200 self-start flex items-center gap-2">
            <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"></span>
        </div>
    </div>
);


interface ChatInterfaceProps {
    history: ChatMessage[];
    isLoading: boolean;
    onSendMessage: (message: string) => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ history, isLoading, onSendMessage }) => {
    const [input, setInput] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history, isLoading]);

    return (
        <div className="mt-10 max-w-4xl mx-auto bg-gray-800/50 border border-gray-700 rounded-xl shadow-lg">
             <div className="flex items-center justify-center gap-3 p-4 bg-gray-800 rounded-t-xl">
                <ChatBubbleLeftEllipsisIcon className="w-6 h-6 text-cyan-400" />
                <h3 className="text-xl font-semibold text-gray-200">Hỏi Đáp Thêm</h3>
             </div>
             
            {/* Chat History */}
            <div className="min-h-[10rem] max-h-[50vh] overflow-y-auto p-4 space-y-4 flex flex-col">
                <div className="flex-grow">
                    {history.map((msg, index) => (
                        <ChatMessageBubble key={index} message={msg} />
                    ))}
                    {isLoading && <LoadingBubble />}
                </div>
                <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="border-t border-gray-700">
                <form onSubmit={handleSubmit} className="flex items-center gap-2 p-2">
                     <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Đặt câu hỏi về phân tích này..."
                        className="w-full bg-transparent text-gray-200 text-base placeholder-gray-500 focus:outline-none px-4 py-2"
                        disabled={isLoading}
                     />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="flex items-center justify-center p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
                        aria-label="Gửi"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                        </svg>
                    </button>
                </form>
            </div>
        </div>
    );
};