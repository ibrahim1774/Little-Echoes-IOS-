import { useApp } from '@/context/AppContext';
import { VideoScreen } from './VideoScreen';
import { VideoUpgradeScreen } from './VideoUpgradeScreen';

export function VideoTab() {
  const { state } = useApp();
  return state.tier === 'basic' ? <VideoUpgradeScreen /> : <VideoScreen />;
}
