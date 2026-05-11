import React, { useMemo, useState } from 'react';
import { NativeModules, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

const HcsPassportNfc = NativeModules.HcsPassportNfc as
  | {
      readPassport?: (
        documentNumber: string,
        dateOfBirthYYMMDD: string,
        expirationDateYYMMDD: string,
      ) => Promise<unknown>;
    }
  | undefined;

export default function App() {
  const [documentNumber, setDocumentNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [status, setStatus] = useState('Idle');

  const bridgeAvailable = useMemo(
    () => typeof HcsPassportNfc?.readPassport === 'function',
    [],
  );

  async function testBridge() {
    if (!HcsPassportNfc?.readPassport) {
      setStatus('NativeModules.HcsPassportNfc is not available');
      return;
    }

    setStatus('Waiting for passport NFC tag...');
    try {
      const result = await HcsPassportNfc.readPassport(
        documentNumber,
        dateOfBirth,
        expirationDate,
      );
      const summary = result && typeof result === 'object'
        ? Object.keys(result as Record<string, unknown>).join(', ')
        : String(result);
      setStatus(`Success: ${summary}`);
    } catch (err) {
      const error = err as { code?: string; message?: string };
      setStatus(`${error.code ?? 'ERROR'}: ${error.message ?? String(err)}`);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#08111f' }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: '700' }}>
          HCS NFC Bridge Test
        </Text>
        <Text style={{ color: '#a8bdd4' }}>
          Bridge: {bridgeAvailable ? 'available' : 'missing'}
        </Text>
        <Text style={{ color: '#a8bdd4' }}>
          Enter BAC keys from a test MRZ. Do not use production passport data in logs or screenshots.
        </Text>

        <TextInput
          value={documentNumber}
          onChangeText={setDocumentNumber}
          placeholder="Document number"
          placeholderTextColor="#64748b"
          autoCapitalize="characters"
          style={inputStyle}
        />
        <TextInput
          value={dateOfBirth}
          onChangeText={setDateOfBirth}
          placeholder="Date of birth YYMMDD"
          placeholderTextColor="#64748b"
          keyboardType="number-pad"
          style={inputStyle}
        />
        <TextInput
          value={expirationDate}
          onChangeText={setExpirationDate}
          placeholder="Expiration date YYMMDD"
          placeholderTextColor="#64748b"
          keyboardType="number-pad"
          style={inputStyle}
        />

        <TouchableOpacity
          onPress={testBridge}
          style={{ backgroundColor: '#00c8ff', padding: 14, borderRadius: 12, alignItems: 'center' }}
        >
          <Text style={{ color: '#001620', fontWeight: '700' }}>Test NFC bridge</Text>
        </TouchableOpacity>

        <View style={{ backgroundColor: '#111c2e', padding: 12, borderRadius: 12 }}>
          <Text style={{ color: '#dbeafe' }}>{status}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const inputStyle = {
  color: 'white',
  borderColor: '#284058',
  borderWidth: 1,
  borderRadius: 10,
  padding: 12,
} as const;
