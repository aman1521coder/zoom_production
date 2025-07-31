import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Zap } from 'lucide-react';

const Home = () => {
  const handleLogin = () => {
    window.location.href = 'https://aizoomai.com/api/auth/zoom';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 font-sans">
      <div className="relative isolate">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="flex justify-center mb-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30">
                <Zap className="h-8 w-8 text-white" />
              </div>
            </div>
            
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl font-sans drop-shadow-lg">
              Meeting Intelligence Platform
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-100 font-normal drop-shadow-md">
              Automatically record, transcribe, and analyze your Zoom meetings with AI-powered insights.
            </p>
          </div>
          
          <div className="mt-10 flex items-center justify-center">
            <button
              onClick={handleLogin}
              className="group inline-flex items-center justify-center rounded-full py-4 px-8 text-lg font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 bg-white text-blue-700 hover:bg-gray-50 active:bg-gray-100 focus-visible:outline-white transition-colors duration-200 font-sans shadow-lg"
            >
              <span>Sign in with Zoom</span>
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform duration-200" />
            </button>
          </div>
        </div>

        <div className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]">
          <div
            className="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr from-blue-400 to-blue-600 opacity-30 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]"
            style={{
              clipPath:
                'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
            }}
          />
        </div>

        <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80">
          <div
            className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-blue-400 to-blue-600 opacity-30 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
            style={{
              clipPath:
                'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
            }}
          />
        </div>

        <div className="mx-auto max-w-2xl py-16">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-8 font-sans drop-shadow-md">Key Features</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="rounded-xl bg-white/20 backdrop-blur-sm p-6 border border-white/30">
                <h3 className="text-lg font-semibold text-white mb-2 font-sans drop-shadow-sm">Auto Recording</h3>
                <p className="text-gray-100 text-sm font-normal leading-relaxed">Automatically join and record your Zoom meetings</p>
              </div>
              <div className="rounded-xl bg-white/20 backdrop-blur-sm p-6 border border-white/30">
                <h3 className="text-lg font-semibold text-white mb-2 font-sans drop-shadow-sm">AI Transcription</h3>
                <p className="text-gray-100 text-sm font-normal leading-relaxed">Get accurate transcripts with speaker identification</p>
              </div>
              <div className="rounded-xl bg-white/20 backdrop-blur-sm p-6 border border-white/30">
                <h3 className="text-lg font-semibold text-white mb-2 font-sans drop-shadow-sm">Smart Insights</h3>
                <p className="text-gray-100 text-sm font-normal leading-relaxed">Extract action items and key topics automatically</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home; 