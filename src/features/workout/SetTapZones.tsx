import React from 'react';
import {Pressable, StyleSheet} from 'react-native';

/**
 * 64dp. The weight row is 230dp wide and the numeral reaches about 190, both
 * centred on a 393dp screen, so a strip this wide down each edge clears every
 * control with room to spare.
 */
const ZONE_WIDTH = 64;

/**
 * Tap the edge of the screen to move a set, the way a story moves a frame.
 *
 * The rail already reads as a row of story segments, so the gesture it implies
 * ought to work. These are the two halves of it — and deliberately plain
 * movement, one set back or forward, not "the next set still to do": a story
 * does not skip the frames you have already seen, and neither should this.
 *
 * Rendered *before* the controls, so the steppers, the numeral and the footer
 * all sit above them and win any overlap. They are also absolutely positioned
 * inside the body, so they never reach the header or the action block.
 */
export function SetTapZones({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  return (
    <>
      {canGoBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous set"
          onPress={onBack}
          style={[styles.zone, styles.left]}
        />
      ) : null}
      {canGoForward ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next set"
          onPress={onForward}
          style={[styles.zone, styles.right]}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  zone: {position: 'absolute', top: 0, bottom: 0, width: ZONE_WIDTH},
  left: {left: 0},
  right: {right: 0},
});
