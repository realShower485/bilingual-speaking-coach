import { create } from 'zustand';

type ActiveView = 'training' | 'history' | 'vocabulary' | 'settings';

interface UiState {
  isPhrasebookOpen: boolean;
  isHistoryPanelOpen: boolean;
  isSettingsPanelOpen: boolean;
  activeView: ActiveView;
  /** 语音模式开关:开启后用录音替代文字输入,AI 回应自动 TTS 播放。 */
  isVoiceMode: boolean;
  togglePhrasebook: () => void;
  toggleHistoryPanel: () => void;
  toggleSettingsPanel: () => void;
  setPhrasebookOpen: (value: boolean) => void;
  setHistoryPanelOpen: (value: boolean) => void;
  setSettingsPanelOpen: (value: boolean) => void;
  setActiveView: (view: ActiveView) => void;
  toggleVoiceMode: () => void;
  setVoiceMode: (value: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  isPhrasebookOpen: false,
  isHistoryPanelOpen: false,
  isSettingsPanelOpen: false,
  activeView: 'training',
  isVoiceMode: false,

  togglePhrasebook: () =>
    set((state) => ({ isPhrasebookOpen: !state.isPhrasebookOpen })),
  toggleHistoryPanel: () =>
    set((state) => ({ isHistoryPanelOpen: !state.isHistoryPanelOpen })),
  toggleSettingsPanel: () =>
    set((state) => ({ isSettingsPanelOpen: !state.isSettingsPanelOpen })),

  setPhrasebookOpen: (value) => set({ isPhrasebookOpen: value }),
  setHistoryPanelOpen: (value) => set({ isHistoryPanelOpen: value }),
  setSettingsPanelOpen: (value) => set({ isSettingsPanelOpen: value }),
  setActiveView: (view) => set({ activeView: view }),

  toggleVoiceMode: () =>
    set((state) => ({ isVoiceMode: !state.isVoiceMode })),
  setVoiceMode: (value) => set({ isVoiceMode: value }),
}));
