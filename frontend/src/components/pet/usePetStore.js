import { create } from 'zustand';
import { loadPetConfig, resolveSkin } from './petConfig';

const STORAGE_KEY = 'miniclaw_pet_settings';

function loadSettings() {
  if (typeof window === 'undefined') return { isVisible: true, currentPet: null };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : { isVisible: true, currentPet: null };
  } catch {
    return { isVisible: true, currentPet: null };
  }
}

function saveSettings(partial) {
  if (typeof window === 'undefined') return;
  try {
    const current = loadSettings();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...partial }));
  } catch { /* ignore */ }
}

const usePetStore = create((set, get) => ({
  // Persisted
  isVisible: loadSettings().isVisible,
  currentPet: loadSettings().currentPet, // pet id

  // Runtime
  config: null,
  skin: null,        // resolved skin object
  agentState: 'idle',
  statusText: '',

  // Fetch config
  init: async () => {
    const config = await loadPetConfig();
    if (!config) return;
    const petId = get().currentPet || config.pets[0]?.id;
    const skin = resolveSkin(config, petId);
    set({ config, skin, currentPet: petId });
  },

  // Actions
  setVisible: (visible) => {
    set({ isVisible: visible });
    saveSettings({ isVisible: visible });
  },

  toggleVisible: () => {
    const next = !get().isVisible;
    set({ isVisible: next });
    saveSettings({ isVisible: next });
  },

  setPet: (petId) => {
    const { config } = get();
    if (!config) return;
    const skin = resolveSkin(config, petId);
    if (!skin) return;
    set({ currentPet: petId, skin });
    saveSettings({ currentPet: petId });
  },

  setAgentState: (agentState) => set({ agentState }),
  setStatusText: (statusText) => set({ statusText }),

  resetToIdle: () => {
    setTimeout(() => set({ agentState: 'idle', statusText: '' }), 1200);
  },
}));

export default usePetStore;
