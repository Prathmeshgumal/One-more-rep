import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Card} from '@/ui/Card';
import {useTheme, space} from '@/theme';
import {usePlanVersionsQuery} from './usePlan';

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/**
 * Every version of the routine, newest first.
 *
 * Not in the approved designs — the week overview draws the entry point but no
 * screen behind it. Built because Phase 2's gate is "confirm an edit forks a
 * new version", and that has to be confirmable on the device rather than by
 * reading the database. A proper design is a Phase 5 item.
 */
export function PlanHistoryScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const {data: versions, isPending} = usePlanVersionsQuery();

  if (isPending) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  return (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.xl},
      ]}>
      <View style={styles.headerBlock}>
        <AppText variant="eyebrow" color="muted">
          {versions && versions.length > 0
            ? `${versions.length} ${versions.length === 1 ? 'version' : 'versions'}`
            : 'Nothing yet'}
        </AppText>
        <AppText variant="h1">Plan history</AppText>
        <AppText variant="small" color="muted">
          Each edit after the day it was made starts a new version. Past
          workouts keep the targets they were performed against.
        </AppText>
      </View>

      {!versions || versions.length === 0 ? (
        <AppText color="muted">
          No plan yet. Create one on the week overview.
        </AppText>
      ) : (
        versions.map(version => (
          <Card key={version.id}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <AppText variant="bodyStrong">{version.name}</AppText>
                <AppText variant="mono" color="muted">
                  {version.effectiveTo === null
                    ? `From ${formatDate(version.effectiveFrom)}`
                    : `${formatDate(version.effectiveFrom)} – ${formatDate(
                        version.effectiveTo,
                      )}`}
                </AppText>
              </View>
              <AppText
                variant="monoSmall"
                color={version.effectiveTo === null ? 'plate' : 'muted'}>
                {version.effectiveTo === null ? 'Active' : 'Replaced'}
              </AppText>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.sm,
  },
  headerBlock: {gap: 2, marginBottom: space.sm},
  row: {flexDirection: 'row', alignItems: 'center', gap: space.md},
  grow: {flex: 1, gap: 2},
});
