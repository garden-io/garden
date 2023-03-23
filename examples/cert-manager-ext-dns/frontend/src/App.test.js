import { render, screen } from '@testing-library/react';
import App from './App';

test('Match text with p element', () => {
  render(<App />);
  const titleElement = screen.getByText(/Hello from Garden! 🌸/i);
  expect(titleElement).toBeInTheDocument();
});
