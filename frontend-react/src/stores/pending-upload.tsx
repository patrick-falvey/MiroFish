import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface PendingUploadState {
  files: File[];
  simulationRequirement: string;
  isPending: boolean;
}

interface PendingUploadContextValue extends PendingUploadState {
  setPendingUpload: (files: File[], requirement: string) => void;
  clearPendingUpload: () => void;
}

const initialState: PendingUploadState = {
  files: [],
  simulationRequirement: '',
  isPending: false,
};

const PendingUploadContext = createContext<PendingUploadContextValue | null>(null);

export function PendingUploadProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PendingUploadState>(initialState);

  const setPendingUpload = useCallback((files: File[], requirement: string) => {
    setState({ files, simulationRequirement: requirement, isPending: true });
  }, []);

  const clearPendingUpload = useCallback(() => {
    setState(initialState);
  }, []);

  return (
    <PendingUploadContext.Provider value={{ ...state, setPendingUpload, clearPendingUpload }}>
      {children}
    </PendingUploadContext.Provider>
  );
}

export function usePendingUpload() {
  const ctx = useContext(PendingUploadContext);
  if (!ctx) throw new Error('usePendingUpload must be used within PendingUploadProvider');
  return ctx;
}
