'use client';

import React, { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details for debugging
    console.error('Error Boundary caught an error:', error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const { children, fallback } = this.props;

      // Use custom fallback if provided
      if (fallback) {
        return fallback(this.state.error, this.resetError);
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <Card className="w-full max-w-md border-red-200 bg-red-50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <AlertCircle className="w-6 h-6 text-red-600" />
                <CardTitle className="text-red-600">Something went wrong</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-red-100 rounded-lg">
                <p className="text-sm text-red-800 font-mono break-words">
                  {this.state.error.message}
                </p>
              </div>
              <p className="text-sm text-slate-600">
                An unexpected error occurred. Please try refreshing the page.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={this.resetError}
                  variant="default"
                  size="sm"
                >
                  Try again
                </Button>
                <Button
                  onClick={() => {
                    window.location.href = '/';
                  }}
                  variant="outline"
                  size="sm"
                >
                  Go to dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
