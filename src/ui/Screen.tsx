import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme, space} from '@/theme';
import {AppText} from './Text';
import {BackButton} from './BackButton';

export function Screen({
  title,
  eyebrow,
  action,
  back = false,
  children,
}: {
  title: string;
  eyebrow?: string;
  /** A control aligned to the right of the heading — the design's `.appbar` button. */
  action?: React.ReactNode;
  /** Shows a back control above the heading. Pushed screens set this. */
  back?: boolean;
  children?: React.ReactNode;
}) {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, {backgroundColor: colors.paper}]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {paddingTop: insets.top + space.xl},
        ]}>
        {back ? <BackButton /> : null}
        <View style={styles.header}>
          <View style={styles.headerText}>
            {eyebrow ? (
              <AppText variant="eyebrow" color="muted">
                {eyebrow}
              </AppText>
            ) : null}
            <AppText variant="h1" style={styles.title}>
              {title}
            </AppText>
          </View>
          {action}
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  title: {marginTop: space.xs},
  header: {flexDirection: 'row', alignItems: 'flex-start', gap: space.md},
  headerText: {flex: 1},
});
