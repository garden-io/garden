import logo from './assets/logo.png';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Hello from Garden! 🌸
        </p>
        <a
          className="App-link"
          href="https://docs.garden.io"
          target="_blank"
          rel="noopener noreferrer"
        >
          Garden.io
        </a>
      </header>
    </div>
  );
}

export default App;
