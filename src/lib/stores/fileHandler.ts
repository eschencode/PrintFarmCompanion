import { writable } from 'svelte/store';
import { browser } from '$app/environment';

interface FileHandlerState {
  token: string;
  connected: boolean;
  checking: boolean;
}

function createFileHandlerStore() {
  const { subscribe, set, update } = writable<FileHandlerState>({
    token: '',
    connected: false,
    checking: false
  });

  let checkInterval: ReturnType<typeof setInterval> | null = null;

  return {
    subscribe,
    
    init: () => {
      if (!browser) return;
      const token = localStorage.getItem('fileHandlerToken') || '';
      update(state => ({ ...state, token }));
      if (token) {
        fileHandlerStore.startChecking();
      }
    },
    
    setToken: (token: string) => {
      if (!browser) return;
      localStorage.setItem('fileHandlerToken', token);
      update(state => ({ ...state, token }));
      if (token) {
        fileHandlerStore.startChecking();
      } else {
        fileHandlerStore.stopChecking();
      }
    },
    
    testConnection: async () => {
      update(state => ({ ...state, checking: true }));
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const response = await fetch('http://127.0.0.1:3001/health', {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const connected = response.ok;
        update(state => ({ ...state, connected, checking: false }));
        console.log(connected ? '✅ File handler connected' : '⚠️ File handler offline');
        return connected;
      } catch (error) {
        update(state => ({ ...state, connected: false, checking: false }));
        console.log('⚠️ File handler offline (this is okay)');
        return false;
      }
    },
    
    startChecking: () => {
      if (checkInterval) clearInterval(checkInterval);
      fileHandlerStore.testConnection();
      checkInterval = setInterval(() => {
        fileHandlerStore.testConnection();
      }, 10000); // Every 10 seconds
    },
    
    stopChecking: () => {
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
      update(state => ({ ...state, connected: false, checking: false }));
    },
    
    openFile: async (filePath: string, moduleName: string, printerId: number) => {
      let currentState: FileHandlerState = { token: '', connected: false, checking: false };
      const unsubscribe = subscribe(state => { currentState = state; });
      unsubscribe();
      
      if (!currentState.token || !currentState.connected) {
        console.log('⚠️ File handler not available - skipping file open');
        return false;
      }
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch('http://127.0.0.1:3001/open-file', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Token': currentState.token
          },
          body: JSON.stringify({ filePath, moduleName, printerId }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        const result = await response.json();
        
        if (result.success) {
          console.log('✅ File opened:', moduleName);
          return true;
        } else {
          console.warn('⚠️ Failed to open file:', result.error);
          return false;
        }
      } catch (error) {
        console.warn('⚠️ File handler error (continuing anyway):', error);
        return false;
      }
    }
  };
}

export const fileHandlerStore = createFileHandlerStore();