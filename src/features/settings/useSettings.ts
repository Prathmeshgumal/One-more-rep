import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useDatabase} from '@/providers/DatabaseGate';
import {
  getSettings,
  updateSettings,
  type SettingsPatch,
} from '@/repositories/settingsRepo';

export const settingsKeys = {all: ['settings'] as const};

export function useSettingsQuery() {
  const db = useDatabase();
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: () => getSettings(db),
  });
}

/** D8 in ten lines: every write invalidates the read that displays it. */
export function useUpdateSettings() {
  const db = useDatabase();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => updateSettings(db, patch),
    onSuccess: () => client.invalidateQueries({queryKey: settingsKeys.all}),
  });
}
