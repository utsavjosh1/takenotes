// RN mappings of the @takenotes/ui/native prop contracts. Excluded from root
// tsc until the Expo install lands (see tsconfig `exclude`).
import type { EmptyStateProps, ListRowProps, NoticeProps, SearchRowProps } from "@takenotes/ui/native";
import { Banner, EmptyView, Row } from "./ui";

export function NativeListRow(props: ListRowProps) {
  return <Row {...props} />;
}

export function NativeSearchRow({ relativePath, preview, onPress }: SearchRowProps) {
  return <Row title={relativePath} detail={preview} onPress={onPress} />;
}

/** The notice contract has one message string; it is shown as the lead line. */
export function NativeNotice({ tone, message, actionLabel, onAction }: NoticeProps) {
  return <Banner tone={tone} title={message} actionLabel={actionLabel} onAction={onAction} />;
}

export function NativeEmptyState(props: EmptyStateProps) {
  return <EmptyView {...props} />;
}
