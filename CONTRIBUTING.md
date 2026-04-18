# Contributing to Ghost Protocol

Thank you for your interest in contributing to Ghost Protocol!

## How to Contribute

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Make** your changes
4. **Commit** your changes (`git commit -m 'Add amazing feature'`)
5. **Push** to the branch (`git push origin feature/amazing-feature`)
6. **Open** a Pull Request

## Development Setup

### Prerequisites
- Node.js 18.x or later
- npm 9.x or later
- Git

### Installation

```bash
# Clone your fork
git clone https://github.com/moner-dev/ghost-protocol-helpdesk.git
cd ghost-protocol-helpdesk

# Install dependencies
npm install

# Start development mode
npm run electron:dev
```

## Code Style

- Use React functional components with hooks
- Follow existing RBAC patterns for any new features
- Use Tailwind CSS for styling
- Keep components in appropriate directories:
  - `src/components/dashboard/` — Dashboard features
  - `src/components/shared/` — Reusable components
  - `src/hooks/` — Custom React hooks
  - `src/utils/` — Utility functions

## Pull Request Guidelines

- Describe what the PR does and why
- Reference any related issues
- Ensure no console errors or warnings
- Test on Windows 10/11 with 100% display scaling

## Questions?

Feel free to open an issue for any questions or suggestions.
