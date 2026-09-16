import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { ErrorState } from '../shared/ui/index.js';

type BoundaryState = { failed: boolean };

export class RouteErrorBoundary extends Component<PropsWithChildren, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {}

  private retry = (): void => {
    this.setState({ failed: false });
  };

  render(): ReactNode {
    if (this.state.failed) {
      return <ErrorState title="This screen could not be displayed" description="Try loading this screen again." retry={this.retry} />;
    }
    return this.props.children;
  }
}
