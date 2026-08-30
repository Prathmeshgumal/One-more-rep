import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme, space} from '@/theme';
import {AppText} from './Text';
import {BackButton} from './BackButton';
import {ScrollFade, FADE_HEIGHT} from './ScrollFade';

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
      {/* Content scrolling up into the status bar was being sliced on a hard
          horizontal line, mid-letter, which reads as a rendering fault rather
          than as an edge. The fade covers the inset as well as the first
          28dp, so a heading dissolves into the bar instead of being cut by
          it. */}
      <ScrollFade height={insets.top + FADE_HEIGHT} />
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
