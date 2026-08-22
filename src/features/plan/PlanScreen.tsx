import React from 'react';
import {Screen} from '@/ui/Screen';
import {AppText} from '@/ui/Text';

export function PlanScreen() {
  return (
    <Screen eyebrow="Plan" title="Your week">
      <AppText color="muted">Your weekly routine appears here in Phase 2.</AppText>
    </Screen>
  );
}
