import { TriangleAlert } from "lucide-react";
import type * as React from "react";
import { Component } from "react";

import { Button } from "~/components/ui/button";
import { useT } from "~/i18n";

interface State {
  readonly error: Error | null;
}

function ErrorPanel({ error }: { error: Error }) {
  const t = useT();
  return (
    <div className="flex h-full items-center justify-center bg-background p-6" role="alert">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <TriangleAlert className="size-6 text-warning-foreground" />
        <p className="font-medium text-sm">{t("error.somethingWrong")}</p>
        <p className="text-muted-foreground text-xs">{error.message}</p>
        <Button size="sm" onClick={() => location.reload()}>
          {t("common.reload")}
        </Button>
      </div>
    </div>
  );
}

/** A render crash must not leave the dashboard a white window: show what failed and offer a reload. */
export class ErrorBoundary extends Component<React.PropsWithChildren, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ErrorPanel error={error} />;
  }
}
