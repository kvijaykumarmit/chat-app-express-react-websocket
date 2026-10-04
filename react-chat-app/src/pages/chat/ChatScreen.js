import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useParams, useLocation } from "react-router-dom";
import axiosInstance from '../../helpers/axiosInstance';
import config from '../../configs/app';
import { useWebSocket } from '../../providers/WebSocketProvider';
import { useAuth } from '../../providers/AuthProvider';
import './chat.css';

const formatTime = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Memoized so a parent re-render (e.g. typing in the input) doesn't force
// React to re-diff every bubble in a long conversation.
const MessageBubble = memo(function MessageBubble({ msg, isSelf }) {
    return (
        <div className={`chat-message ${isSelf ? 'sent' : 'received'}`}>
            {Array.isArray(msg.media_files) && msg.media_files.length > 0 && (
                <div className="chat-media-group">
                    {msg.media_files.map((file, i) => (
                        file.mime_type?.startsWith('image') ? (
                            <img
                                key={i}
                                src={file.preview}
                                alt={file.original_name || 'attachment'}
                                className="chat-media"
                                loading="lazy"
                                decoding="async"
                            />
                        ) : file.mime_type?.startsWith('video') ? (
                            <video key={i} src={file.preview} controls className="chat-media" preload="none" />
                        ) : (
                            <a key={i} href={file.preview} target="_blank" rel="noreferrer" className="chat-file-link">
                                📄 {file.original_name}
                            </a>
                        )
                    ))}
                </div>
            )}
            {msg.message && <p className="chat-message-text">{msg.message}</p>}
            <span className="chat-timestamp">{formatTime(msg.created_at)}</span>
        </div>
    );
});

const ChatScreen = () => {
    const [messages, setMessages] = useState([]);
    const [draftMessage, setDraftMessage] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [messageLoading, setMessageLoading] = useState(false); // For loading state of sending messages
    const chatBodyRef = useRef(null);
    const scrollThrottleRef = useRef(null);
    const { userId } = useParams();
    const location = useLocation();
    const displayName = location.state?.displayName || "User";
    const { ws } = useWebSocket();
    const { user } = useAuth();
    const LIMIT = 25; // Default limit for fetching messages
    const [isScrolling, setIsScrolling] = useState(true);

    // Fetch chat conversations with limit and skip
    const fetchMessages = async (sort="recent") => {
        let messagesLength = messages.length;
        try {
            setMessageLoading(true);
            let sortId = sort==="recent"?messages[(messagesLength-1)]?._id:messages[0]?._id;
            const response = await axiosInstance.get(`${config.baseURL}/chat/conversations/${userId}`, {
                params: {
                    limit: LIMIT,
                    sort: sort,
                    sortId: sortId
                },
            });

            // Fallback to an empty array if no messages are returned
            const fetchedMessages = response.data?.messages || [];
            if(response.data.draftMessage){
                setDraftMessage(response.data.draftMessage);
                if(response.data.draftMessage.message){
                    setNewMessage(response.data.draftMessage.message);
                }
            }else{
                setDraftMessage(null);
            }
            if (fetchedMessages.length > 0) {
                setMessages((prevMessages) => {
                    if (messagesLength === 0) {
                        return fetchedMessages;
                    }
                    if(sort==="recent"){
                        return [...prevMessages, ...fetchedMessages];
                    }else{
                        return [...fetchedMessages, ...prevMessages];
                    }
                });
            } else if (messagesLength === 0) {
                setMessages([]);
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
        } finally {
            if (messagesLength === 0) {
                setTimeout(() => {  scrollToBottom();  }, 100);
            }
            setMessageLoading(false);
        }
    };


    // Send a message or file
    const sendMessage = async () => {
        if (!newMessage && (draftMessage?.media_files?.length??0)===0) return;
        setLoading(true);
        const formData = new FormData();
        formData.append('userId', userId);
        formData.append('message', newMessage);
        try {
            const response = await axiosInstance.post(`${config.baseURL}/chat/send/${userId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setMessages((prev) => [...prev, response.data.message]);
            setNewMessage('');
            setDraftMessage(null);
            setTimeout(() => {  scrollToBottom();  }, 100);

        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            setLoading(false);
        }
    };



    const sendFile = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('userId', userId);
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);  // Append each file with the key 'files'
        }
        try {
            const response = await axiosInstance.post(`${config.baseURL}/chat/send/${userId}/draft`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setDraftMessage(response.data.message);
        } catch (error) {
            console.error('Error uploading file:', error);
        } finally {
            setUploading(false);
            e.target.value = null;
        }
    };

    // Remove a staged (not-yet-sent) file from the draft
    const removeDraftFile = async (filename) => {
        try {
            const response = await axiosInstance.delete(
                `${config.baseURL}/chat/send/${userId}/draft/${encodeURIComponent(filename)}`
            );
            setDraftMessage(response.data.draftMessage);
        } catch (error) {
            console.error('Error removing file:', error);
        }
    };



    // Scroll to the bottom of the chat body
    const scrollToBottom = () => {
        setIsScrolling(true);  // Disable scroll handler
        const chatBody = chatBodyRef.current;
        if (chatBody) {
            chatBody.scrollTop = chatBody.scrollHeight; // Scrolls to the bottom
        }

        // Reset the flag after the scroll is completed
        setTimeout(() => {
            setIsScrolling(false);
        }, 600);  // Time should match the scroll behavior duration
    };

    // Detect when the user scrolls near either edge of the chat body.
    // The throttle guard lives in a ref (not a per-render closure variable)
    // so it actually persists between scroll events instead of resetting
    // on every re-render.
    const handleScroll = useCallback(() => {
        if (isScrolling) return;
        const chatBody = chatBodyRef.current;
        if (!chatBody) return;
        if (scrollThrottleRef.current) return;

        scrollThrottleRef.current = setTimeout(() => {
            scrollThrottleRef.current = null;
            if (!messageLoading) {
                if (chatBody.scrollTop === 0) {      // Fetch Previous
                    fetchMessages("previous");
                } else if (chatBody.scrollHeight === chatBody.scrollTop + chatBody.clientHeight) {
                    fetchMessages();
                }
            }
        }, 500); // Throttle interval
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isScrolling, messageLoading, userId]);

    // Handle WebSocket incoming messages: the server already sends the full
    // message payload, so append it directly instead of re-fetching the
    // whole conversation on every event.
    const handleNewMessage = (data) => {
        const incoming = data?.message;
        if (!incoming) return;
        // This socket only ever receives messages where the current user is
        // the receiver, so a message belongs to this open thread when it was
        // sent by the conversation partner currently being viewed.
        if (incoming.sender_id === userId) {
            setMessages((prev) => [...prev, incoming]);
            setTimeout(() => { scrollToBottom(); }, 100);
        }
    };

    useEffect(() => {
        if(!messageLoading){ fetchMessages();  }
        if (ws) {
            ws.on('new-message', handleNewMessage);
        }
        // Cleanup WebSocket listener on unmount
        return () => {
            if (ws) {
                ws.off('new-message', handleNewMessage);
            }
        };
    }, [userId, ws]);

    return (
        <div className="container">
            <div className="chat-screen card">
                {/* Header */}
                <div className="chat-header card-header">
                    <h3>{displayName}</h3>
                </div>

                {/* Chat Body */}
                <div className="chat-body" ref={chatBodyRef} onScroll={handleScroll}>
                    {messages.map((msg, index) => (
                        <MessageBubble
                            key={msg._id || index}
                            msg={msg}
                            isSelf={msg.sender_id === user?._id}
                        />
                    ))}
                </div>


                {draftMessage?.media_files?.length > 0 && (
                    <div className='draft-message'>
                        {draftMessage.media_files.map((fileObj) => (
                            <div key={fileObj.filename} className='file-temp'>
                                {fileObj.mime_type?.startsWith('image') ? (
                                    <img
                                        src={fileObj.preview}
                                        alt={fileObj.original_name}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        loading="lazy"
                                        decoding="async"
                                    />
                                ) : fileObj.mime_type?.startsWith('video') ? (
                                    <video
                                        src={fileObj.preview}
                                        controls
                                        preload="metadata"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    <div className="file-temp-doc">
                                        <p>{fileObj.original_name}</p>
                                    </div>
                                )}

                                <button
                                    className="close-btn"
                                    aria-label="Remove"
                                    type="button"
                                    onClick={() => removeDraftFile(fileObj.filename)}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-x-circle" viewBox="0 0 16 16">
                                        <path d="M12.854 1.146a1 1 0 0 1 0 1.414L9.414 6l3.44 3.44a1 1 0 0 1-1.415 1.415L8 7.414l-3.44 3.44a1 1 0 0 1-1.415-1.415L6.586 6 3.146 2.56a1 1 0 0 1 1.415-1.415L8 4.586l3.44-3.44a1 1 0 0 1 1.414 0z"/>
                                    </svg>
                                </button>
                            </div>
                        ))}
                        {uploading && <div className="file-temp file-temp-uploading"><span className="spinner" /></div>}
                    </div>
                )}
                {uploading && !(draftMessage?.media_files?.length > 0) && (
                    <div className="draft-message">
                        <div className="file-temp file-temp-uploading"><span className="spinner" /></div>
                    </div>
                )}
                <div className="chat-input">
                    <input
                        type="file"
                        onChange={sendFile}
                        style={{ display: 'none' }}
                        id="fileInput"
                        accept="image/*,video/*"
                        multiple
                    />
                    <label htmlFor="fileInput" className="attach-button" title="Attach image or video">📎</label>
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
                        placeholder="Type a message..."
                    />
                    <button onClick={sendMessage} disabled={loading}>
                        {loading ? 'Sending...' : 'Send'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatScreen;
