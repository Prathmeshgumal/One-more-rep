import React, {createContext, useContext, useEffect, useState} from 'react';
import {ActivityIndicator, ScrollView, StyleSheet, Text, View} from 'react-native';
import {getDatabase} from '@/db/client';
import {runMigrations} from '@/db/migrate';
import {seedExercises} from '@/db/seed/seedExercises';
import {rollOverStaleSessions} from '@/repositories/sessionRepo';
import type {AppDatabase} from '@/db/types';
import {useTheme, type as typeScale, space, radius} from '@/theme';

const DatabaseContext = createContext<AppDatabase | null>(null);

export function useDatabase(): AppDatabase {
  const db = useContext(DatabaseContext);
  if (!db) {
    throw new Error('useDatabase must be used inside DatabaseGate');
  }
  return db;
}

type Status =
  | {phase: 'starting'}
  | {phase: 'ready'; db: AppDatabase}
  | {phase: 'failed'; reason: string};

/**
 * Runs migrations and seeds the exercise library before anything else renders.
 * A failure shows a blocking screen rather than a crash loop (spec section 10).
 *
 * Seeding lives here rather than behind the library screen so a half-populated
 * library can never be browsed: either the whole library is in, or the gate
 * says so.
 */
export function DatabaseGate({
  children,
  getDb = getDatabase,
}: {
  children: React.ReactNode;
  getDb?: () => AppDatabase;
}) {
  const {colors} = useTheme();
  const [status, setStatus] = useState<Status>({phase: 'starting'});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = getDb();
        await runMigrations(db);
        await seedExercises(db);
        // Spec 6.4: a session left open overnight closes as abandoned, keeping
        // every set it recorded. Launch is the only moment this can happen —
        // there is no background job anywhere in this app.
        await rollOverStaleSessions(db);
        if (!cancelled) {
          setStatus({phase: 'ready', db});
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            phase: 'failed',
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getDb]);

  if (status.phase === 'ready') {
    return (
      <DatabaseContext.Provider value={status.db}>
        {children}
      </DatabaseContext.Provider>
    );
  }

  if (status.phase === 'failed') {
    return (
      <ScrollView
        style={{backgroundColor: colors.paper}}
        contentContainerStyle={styles.centre}>
        <Text style={[typeScale.eyebrow, {color: colors.short}]}>Database</Text>
        <Text style={[typeScale.h1, {color: colors.ink, marginTop: space.sm}]}>
          We couldn't open your data
        </Text>
        <Text style={[typeScale.body, {color: colors.ink2, marginTop: space.md}]}>
          Your workouts are still on this device. Reopen the app to try again —
          if this keeps happening, reinstalling will start a fresh database.
        </Text>
        <Text
          style={[
            typeScale.mono,
            styles.reason,
            {color: colors.muted, backgroundColor: colors.surface2},
          ]}>
          {status.reason}
        </Text>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.centre, styles.fill, {backgroundColor: colors.paper}]}>
      <ActivityIndicator color={colors.plate} />
    </View>
  );
}

/** Supplies a database directly, bypassing migrations. Tests only. */
export function DatabaseContextTestProvider({
  db,
  children,
}: {
  db: AppDatabase;
  children: React.ReactNode;
}) {
  return (
    <DatabaseContext.Provider value={db}>{children}</DatabaseContext.Provider>
  );
}

const styles = StyleSheet.create({
  centre: {flexGrow: 1, justifyContent: 'center', padding: space.xxl},
  fill: {flex: 1},
  reason: {marginTop: space.xl, padding: space.md, borderRadius: radius.sm},
});
