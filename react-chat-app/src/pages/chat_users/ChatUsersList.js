import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from "react-router-dom";
import axiosInstance from '../../helpers/axiosInstance';
import config from '../../configs/app';
import { useAuth } from '../../providers/AuthProvider';
import { useWebSocket } from '../../providers/WebSocketProvider';
import './chat-users.css'

const ChatUsersList = () => {
  const [users, setUsers] = useState([]);
  const [skip, setSkip] = useState(0);
  const limit = 25;
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const { logout } = useAuth();
  const {ws} = useWebSocket();

  const containerRef = useRef(null);
  const navigate = useNavigate();

  // Fetch users
  const fetchUsers = async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      const response = await axiosInstance.get('/chat/users', { params:{ skip, limit }});
      const { users: newUsers, totalCount } = response.data;

      setUsers((prev) => [...prev, ...newUsers]);
      setSkip((prev) => prev + limit);

      // Check if we have more users to fetch
      if (users.length + newUsers.length >= totalCount) {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle scroll event
  const handleScroll = () => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 5) {
      fetchUsers();
    }
  };

  const navigateToUser = (userId, displayName) => {
      navigate(`/conversations/${userId}`, {
          state: { displayName }, // Pass displayName using state
      });
  };

  useEffect(() => {
    fetchUsers();
    ws?.on('new-message',(data)=>{
      console.log("data on message", data);
    });
  }, []); // Fetch initial users on component mount

  return (
    <div className="container">
      <div className="chat-box card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Chat Users</h5>
          <button className='btn btn-logout' onClick={logout}>Logout</button>
        </div>
        <div
          className="card-body"
          id="chat-user-list"
          style={{ overflowY: 'auto' }}
          onScroll={handleScroll}
          ref={containerRef}
        >
          {users.map((user) => (
            <div key={user._id} className="d-flex align-items-start mb-3 user-cards"  onClick={() => navigateToUser(user._id, user.display_name)}>
              <img
                src={user.image || `${config.baseURL}/images/placeholder.png`}
                alt="User"
                className="rounded-circle me-3"
                style={{ width: '50px', height: '50px', objectFit: 'cover' }}
              />
              <div>
                <h6 className="mb-1">{user.display_name}</h6>
                {user.recent_chat?.message ? (
                  <p className="text-muted mb-0" style={{ fontSize: '0.9rem' }}>
                    {user.recent_chat.message}
                  </p>
                ) : user.recent_chat?.media_files?.length > 0 ? (
                  <p className="text-muted mb-0" style={{ fontSize: '0.9rem' }}>
                    {user.recent_chat.media_files[0].mime_type?.startsWith('video') ? '🎥 Video' : '📷 Photo'}
                  </p>
                ) : (
                  <p className="text-muted mb-0" style={{ fontSize: '0.9rem' }}>
                    No recent messages
                  </p>
                )}
              </div>
            </div>
          ))}
          {loading && <p className="text-center">Loading...</p>}
        </div>
      </div>
    </div>
  );
};

export default ChatUsersList;
