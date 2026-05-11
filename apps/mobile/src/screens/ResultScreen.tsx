/**
 * ResultScreen — Two-phase verification result.
 *
 * Phase 1 (SELFIE): If no faceMatchResult in store yet, show the DG2
 * chip photo and render FaceMatchNative for selfie capture + comparison.
 *
 * Phase 2 (VERDICT): 4-check recap + global verdict + reset button.
 */

import React, { useEffect, useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import {
  FaceMatchNative,
  useIDVerificationNative,
  type PassportNfcResult,
} from '@hcs/id-scanner-native';

import { useAppConfig } from '../ConfigContext';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = StackScreenProps<RootStackParamList, 'Result'>;

// ─── Colors ──────────────────────────────────────────────────────────────────

const C = {
  bg: '#08111f',
  card: '#0f1a2b',
  border: '#1c2e45',
  text: '#e2eaf3',
  muted: '#7a93ad',
  accent: '#00c8ff',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#f59e0b',
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface CheckItem {
  label: string;
  passed: boolean;
  detail?: string;
}

function CheckRow({ label, passed, detail }: CheckItem) {
  return (
    <View style={s.checkRow}>
      <Text style={[s.checkIcon, { color: passed ? C.green : C.red }]}>
        {passed ? '✓' : '✕'}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={s.checkLabel}>{label}</Text>
        {detail ? <Text style={s.checkDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ResultScreen({ navigation, route }: Props): React.ReactElement {
  const { apiUrl, apiToken, minFaceMatchScore } = useAppConfig();
  const nfcResult = route.params?.nfcResult as PassportNfcResult | undefined;

  const {
    documentData,
    faceMatchResult,
    setDocumentImageUri,
    reset,
  } = useIDVerificationNative();

  // If DG2 face image is available from the chip, use it as the target
  // for face comparison instead of the MRZ scan image.
  useEffect(() => {
    if (nfcResult?.dg2FaceImageBase64) {
      setDocumentImageUri(
        `data:image/jpeg;base64,${nfcResult.dg2FaceImageBase64}`,
      );
    }
  }, [nfcResult?.dg2FaceImageBase64, setDocumentImageUri]);

  // ── Checks ──

  const checks = useMemo<CheckItem[]>(() => {
    const mrzValid = Boolean(documentData?.checkDigitsValid && !documentData?.isExpired);
    const chipRead = Boolean(nfcResult?.success);
    const chipMatchesMrz = Boolean(nfcResult?.chipMrzMatchesScannedMrz);
    const faceMatched = Boolean(faceMatchResult?.isMatch);

    return [
      {
        label: 'MRZ valide',
        passed: mrzValid,
        detail: mrzValid
          ? `${documentData?.firstName} ${documentData?.lastName} — ${documentData?.documentNumber}`
          : documentData
            ? 'Check digits invalides ou document expiré'
            : 'Aucune donnée MRZ',
      },
      {
        label: 'Puce NFC lue',
        passed: chipRead,
        detail: chipRead
          ? 'Données du chip extraites avec succès'
          : nfcResult
            ? 'Échec de lecture de la puce'
            : 'Lecture NFC non effectuée',
      },
      {
        label: 'Chip = MRZ',
        passed: chipMatchesMrz,
        detail: chipMatchesMrz
          ? 'Le numéro du chip correspond au MRZ scanné'
          : nfcResult
            ? 'Les données du chip ne correspondent pas au MRZ'
            : 'Comparaison non disponible',
      },
      {
        label: 'Visage reconnu',
        passed: faceMatched,
        detail: faceMatchResult
          ? `Similarité : ${faceMatchResult.similarity.toFixed(1)}% (seuil : ${faceMatchResult.threshold}%)`
          : 'Vérification faciale en attente',
      },
    ];
  }, [documentData, nfcResult, faceMatchResult]);

  const allPassed = checks.every((c) => c.passed);

  // ── Phase 1: Selfie ──

  const needsSelfie = !faceMatchResult;

  if (needsSelfie) {
    const faceMatchEndpoint = `${apiUrl.replace(/\/$/, '')}/api/face-match`;
    const authHeader = apiToken ? `Bearer ${apiToken}` : undefined;
    const dg2Uri = nfcResult?.dg2FaceImageBase64
      ? `data:image/jpeg;base64,${nfcResult.dg2FaceImageBase64}`
      : null;

    return (
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={() => navigation.goBack()} style={s.backButton}>
            <Text style={s.backText}>← Retour</Text>
          </Pressable>
          <Text style={s.headerTitle}>Vérification du visage</Text>
          <Text style={s.headerSubtitle}>
            Prenez un selfie pour confirmer votre identité
          </Text>
        </View>

        {/* DG2 preview */}
        {dg2Uri && (
          <View style={s.dg2Container}>
            <Image source={{ uri: dg2Uri }} style={s.dg2Image} resizeMode="cover" />
            <Text style={s.dg2Label}>Photo extraite du chip</Text>
          </View>
        )}

        {/* FaceMatchNative handles camera + comparison */}
        <View style={{ flex: 1 }}>
          <FaceMatchNative
            faceMatchEndpoint={faceMatchEndpoint}
            authHeader={authHeader}
            threshold={minFaceMatchScore}
          />
        </View>
      </View>
    );
  }

  // ── Phase 2: Verdict ──

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scrollContent}>
        {/* Title */}
        <View style={s.verdictHeader}>
          <Text style={[s.verdictIcon, { color: allPassed ? C.green : C.red }]}>
            {allPassed ? '✓' : '✕'}
          </Text>
          <Text
            style={[
              s.verdictTitle,
              { color: allPassed ? C.green : C.red },
            ]}
          >
            {allPassed ? 'IDENTITÉ VÉRIFIÉE' : 'VÉRIFICATION ÉCHOUÉE'}
          </Text>
          {!allPassed && (
            <Text style={s.verdictReason}>
              {checks
                .filter((c) => !c.passed)
                .map((c) => c.label)
                .join(', ')}
            </Text>
          )}
        </View>

        {/* Checks */}
        <View style={s.card}>
          {checks.map((check) => (
            <CheckRow key={check.label} {...check} />
          ))}
        </View>

        {/* Warnings from NFC */}
        {nfcResult?.warnings && nfcResult.warnings.length > 0 && (
          <View style={s.warningsCard}>
            <Text style={s.warningsTitle}>Avertissements</Text>
            {nfcResult.warnings.map((w) => (
              <Text key={w} style={s.warningText}>⚠ {w}</Text>
            ))}
          </View>
        )}

        {/* Identity details */}
        {documentData && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Identité</Text>
            <DetailRow label="Nom" value={`${documentData.firstName} ${documentData.lastName}`} />
            <DetailRow label="Document" value={documentData.documentNumber} />
            <DetailRow label="Nationalité" value={documentData.nationality} />
            <DetailRow label="Naissance" value={documentData.dateOfBirth} />
            <DetailRow label="Expiration" value={documentData.expirationDate} />
            <DetailRow label="Type" value={documentData.documentType} />
          </View>
        )}

        {/* Reset button */}
        <Pressable
          onPress={() => {
            reset();
            navigation.reset({ index: 0, routes: [{ name: 'ScanMRZ' }] });
          }}
          style={s.resetButton}
        >
          <Text style={s.resetButtonText}>Nouvelle vérification</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ─── Sub-component ───────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backButton: {
    marginBottom: 12,
  },
  backText: {
    color: C.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: C.muted,
    fontSize: 14,
    marginTop: 6,
  },

  // DG2 preview
  dg2Container: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  dg2Image: {
    width: 100,
    height: 130,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  dg2Label: {
    color: C.muted,
    fontSize: 12,
    marginTop: 6,
  },

  // Verdict
  scrollContent: {
    padding: 20,
    paddingTop: 52,
    gap: 16,
  },
  verdictHeader: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  verdictIcon: {
    fontSize: 48,
    fontWeight: '700',
  },
  verdictTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
  },
  verdictReason: {
    color: C.muted,
    fontSize: 13,
    textAlign: 'center',
  },

  // Card
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },

  // Checks
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkIcon: {
    fontSize: 18,
    fontWeight: '700',
    width: 22,
    textAlign: 'center',
    marginTop: 1,
  },
  checkLabel: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  checkDetail: {
    color: C.muted,
    fontSize: 12,
    marginTop: 2,
  },

  // Warnings
  warningsCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    padding: 16,
    gap: 6,
  },
  warningsTitle: {
    color: C.yellow,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  warningText: {
    color: C.yellow,
    fontSize: 13,
  },

  // Details
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    color: C.muted,
    fontSize: 13,
  },
  detailValue: {
    color: C.text,
    fontSize: 13,
    fontWeight: '600',
  },

  // Reset
  resetButton: {
    backgroundColor: C.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  resetButtonText: {
    color: '#001620',
    fontWeight: '700',
    fontSize: 15,
  },
});
