import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './providers/AuthProvider';
import { WebSocketProvider } from './providers/WebSocketProvider';
import ProtectedRoute from './ProtectedRoute';

import './App.css';

// Route-level code-splitting: each page's JS (and its own dependencies, e.g.
// Formik/Yup for Login) is only fetched when that route is actually visited.
const Login = lazy(() => import('./pages/login/Login'));
const ChatUsersList = lazy(() => import('./pages/chat_users/ChatUsersList'));
const ChatScreen = lazy(() => import('./pages/chat/ChatScreen'));

const PageNotFound = ()=>(<h1>PageNotFound</h1>);

function App() {
  return (
    <AuthProvider>
  <WebSocketProvider>
    <Router>
      <Suspense fallback={<div className="app-loading">Loading...</div>}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/chat" element={<ProtectedRoute element={<ChatUsersList />} />} />
          <Route path="/conversations/:userId" element={<ProtectedRoute element={<ChatScreen />} />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Suspense>
    </Router>
  </WebSocketProvider>
  </AuthProvider>
  );
}
export default App;
