import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import styled from 'styled-components';
import VideoUploader from './components/VideoUploader';
import LiveStreaming from './components/LiveStreaming';
import VideoPlayer from './components/VideoPlayer';
import StreamManager from './components/StreamManager';
import { SocketProvider } from './services/socketService';

const AppContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
`;

const Header = styled.header`
  background: rgba(0, 0, 0, 0.2);
  padding: 1rem 2rem;
  backdrop-filter: blur(10px);
`;

const Nav = styled.nav`
  display: flex;
  gap: 2rem;
  align-items: center;
`;

const Logo = styled.h1`
  margin: 0;
  font-size: 1.8rem;
  font-weight: bold;
`;

const NavLink = styled(Link)`
  color: white;
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  transition: background-color 0.3s;

  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  &.active {
    background-color: rgba(255, 255, 255, 0.2);
  }
`;

const Main = styled.main`
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
`;

const StatusBar = styled.div`
  background: rgba(0, 0, 0, 0.3);
  padding: 0.5rem 2rem;
  font-size: 0.9rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const StatusIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const StatusDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${props => props.connected ? '#4ade80' : '#ef4444'};
`;

function App() {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [activeStreams, setActiveStreams] = useState(0);

  return (
    <SocketProvider onConnectionChange={setConnectionStatus}>
      <Router>
        <AppContainer>
          <Header>
            <Nav>
              <Logo>Video Processing System</Logo>
              <NavLink to="/">Upload</NavLink>
              <NavLink to="/live">Live Stream</NavLink>
              <NavLink to="/player">Player</NavLink>
              <NavLink to="/streams">Streams</NavLink>
            </Nav>
          </Header>

          <StatusBar>
            <StatusIndicator>
              <StatusDot connected={connectionStatus === 'connected'} />
              Server: {connectionStatus}
            </StatusIndicator>
            <div>Active Streams: {activeStreams}</div>
          </StatusBar>

          <Main>
            <Routes>
              <Route
                path="/"
                element={<VideoUploader />}
              />
              <Route
                path="/live"
                element={<LiveStreaming />}
              />
              <Route
                path="/player"
                element={<VideoPlayer />}
              />
              <Route
                path="/streams"
                element={<StreamManager onStreamCountChange={setActiveStreams} />}
              />
            </Routes>
          </Main>
        </AppContainer>
      </Router>
    </SocketProvider>
  );
}

export default App;