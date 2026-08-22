import React from 'react';
import {StatusBar} from 'react-native';
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
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryProvider>
          <DatabaseGate>
            <Chrome />
          </DatabaseGate>
        </QueryProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
