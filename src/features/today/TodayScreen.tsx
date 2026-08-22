import React from 'react';
import {Screen} from '@/ui/Screen';
import {AppText} from '@/ui/Text';

export function TodayScreen() {
  return (
    <Screen title="Today">
      <AppText color="muted">Your workout for today appears here in Phase 3.</AppText>
    </Screen>
  );
}
