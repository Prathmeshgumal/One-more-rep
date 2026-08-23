import React from 'react';
import {StatusBar, StyleSheet} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer} from '@react-navigation/native';
import {ThemeProvider, useTheme} from '@/theme';
import {QueryProvider} from '@/providers/QueryProvider';
import {DatabaseGate} from '@/providers/DatabaseGate';
import {RootNavigator} from '@/navigation/RootNavigator';

function Chrome() {
  const {scheme} = useTheme();
  return (
    <>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    // Gesture Handler needs a root view at the very top, or drag gestures
    // silently never fire — no error, just a list that will not move.
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryProvider>
            <DatabaseGate>
              <Chrome />
            </DatabaseGate>
          </QueryProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({root: {flex: 1}});
