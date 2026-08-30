import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Segmented} from '@/ui/Segmented';
import {ScrollFade, useScrollFade} from '@/ui/ScrollFade';
import {useTheme, useThemeMode, space} from '@/theme';
import type {ThemeMode, WeightUnit} from '@/db/schema';
import {APP_VERSION} from '@/constants';
import type {SettingsStackParamList} from '@/navigation/types';
import {useSettingsQuery, useUpdateSettings} from './useSettings';
import {Group, LinkRow, ValueRow, ControlRow} from './SettingsRows';
import {SectionIndex, useSectionIndex} from './SectionIndex';

const THEMES = [
  {value: 'system', label: 'Auto', accessibilityLabel: 'System'},
  {value: 'light', label: 'Light', accessibilityLabel: 'Light'},
  {value: 'dark', label: 'Dark', accessibilityLabel: 'Dark'},
] as const satisfies ReadonlyArray<{
  value: ThemeMode;
  label: string;
  accessibilityLabel: string;
}>;

const UNITS = [
  {value: 'kg', label: 'kg', accessibilityLabel: 'Kilograms'},
  {value: 'lb', label: 'lb', accessibilityLabel: 'Pounds'},
] as const satisfies ReadonlyArray<{
  value: WeightUnit;
  label: string;
  accessibilityLabel: string;
}>;

/**
 * U4. 0.5 is the smallest plate most gyms have; 5 is a plate a side on a
 * barbell. Anything outside this range is faster to type than to step to.
 */
const STEPS = [0.5, 1, 2.5, 5].map(step => ({
  value: step,
  label: String(step),
  accessibilityLabel: `Step by ${step}`,
}));

const SECTIONS = [
  {key: 'lifting', label: 'Lifting'},
  {key: 'appearance', label: 'Appearance'},
  {key: 'about', label: 'About'},
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

const KEYS = SECTIONS.map(s => s.key);

/**
 * Settings, as sections behind a pinned index.
 *
 * What this replaces was four questions asked in a column of nine identical
 * bordered boxes — three of which existed to say "kg" or "0.5" — running to
 * 1100dp for a page with four answers on it. It read as a form you were
 * filling in rather than as the place the app keeps itself, and the one
 * destination on it hid among the radio buttons.
 *
 * The title and the index are outside the ScrollView, the way the workout
 * screen already pins its calendar and plan buttons: an index that scrolled
 * away with the content would be an index you have to scroll back up to use.
 * That is also why this does not use `Screen`, whose header scrolls by design.
 *
 * Three sections do not need an index. Four will, and the section that makes
 * it four is the one about your data — which, for an app whose entire history
 * is a single file on a single phone, this page ought to be saying something
 * about and currently says nothing.
 */
export function SettingsScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const {data, isPending} = useSettingsQuery();
  const update = useUpdateSettings();
  const setMode = useThemeMode(state => state.setMode);

  const index = useSectionIndex<SectionKey>(KEYS);
  const fade = useScrollFade();

  const unit = data?.unit ?? 'kg';

  const section = (key: SectionKey, label: string, body: React.ReactNode) => (
    <View onLayout={e => index.measure(key)(e.nativeEvent.layout.y)}>
      <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>
        {label}
      </AppText>
      {body}
    </View>
  );

  return (
    <View style={[styles.root, {backgroundColor: colors.paper}]}>
      <View style={[styles.bar, {paddingTop: insets.top + space.md}]}>
        <AppText variant="h1">Settings</AppText>
        <View style={styles.chips}>
          <SectionIndex
            sections={SECTIONS}
            active={index.active}
            onJump={index.jump}
          />
        </View>
      </View>

      <View style={styles.scroller}>
        <ScrollView
          ref={index.scroller}
          onScroll={e => {
            fade.scrollProps.onScroll(e);
            index.onScrollY(e.nativeEvent.contentOffset.y);
          }}
          scrollEventThrottle={fade.scrollProps.scrollEventThrottle}
          contentContainerStyle={styles.content}>
          {section(
            'lifting',
            'Lifting',
            <Group>
              <ControlRow label="Unit">
                <Segmented
                  options={UNITS}
                  value={data?.unit}
                  disabled={isPending}
                  onChange={value => update.mutate({unit: value})}
                />
              </ControlRow>
              <ControlRow label="Step">
                <Segmented
                  options={STEPS}
                  value={data?.defaultIncrement}
                  disabled={isPending}
                  onChange={value => update.mutate({defaultIncrement: value})}
                />
              </ControlRow>
              {/* The library was a tab of its own. It belongs here because it
                  is something you set up rather than something you do — and
                  reaching for it mid-workout is served by the pickers, which
                  can create an exercise without leaving the workout at all. */}
              <LinkRow
                label="Exercise library"
                hint="Browse every movement, and add your own"
                onPress={() => navigation.navigate('ExerciseList')}
              />
            </Group>,
          )}

          <AppText variant="small" color="muted" style={styles.aside}>
            {`The − and + buttons move weight by ${
              data?.defaultIncrement ?? 0.5
            } ${unit}. You can always tap a number and type it instead.`}
          </AppText>

          {section(
            'appearance',
            'Appearance',
            <Group>
              <ControlRow label="Theme">
                <Segmented
                  options={THEMES}
                  value={data?.themeMode}
                  disabled={isPending}
                  onChange={value => {
                    // The store first, so the screen repaints under the
                    // finger. The write is what makes it survive a relaunch;
                    // waiting on the round trip to repaint would make the tap
                    // feel dropped.
                    setMode(value);
                    update.mutate({themeMode: value});
                  }}
                />
              </ControlRow>
            </Group>,
          )}

          {section(
            'about',
            'About',
            <Group>
              {/* So a bug report can name the build it came from. */}
              <ValueRow label="Version" value={APP_VERSION} />
            </Group>,
          )}

          <AppText variant="monoSmall" color="faint" style={styles.footnote}>
            Everything stays on this phone.
          </AppText>
        </ScrollView>
        <ScrollFade visible={fade.faded} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  scroller: {flex: 1},
  bar: {paddingHorizontal: space.xl, paddingBottom: space.md, gap: space.md},
  chips: {flexDirection: 'row', gap: space.sm, flexWrap: 'wrap'},
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  sectionLabel: {marginBottom: space.sm, marginLeft: space.xs},
  aside: {marginTop: -space.sm},
  footnote: {marginTop: space.lg, textAlign: 'center'},
});
