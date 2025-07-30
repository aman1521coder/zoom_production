import React from 'react';
import { Video, Shield, Zap, ArrowRight } from 'lucide-react';

const Home = () => {
  const handleLogin = () => {
    window.location.href = 'https://aizoomai.com/api/auth/zoom';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="pt-20 pb-16 text-center lg:pt-32">
          <h1 className="mx-auto max-w-4xl font-display text-5xl font-medium tracking-tight text-slate-900 sm:text-7xl">
            <span className="relative whitespace-nowrap text-primary-600">
              <span className="relative">aizoomai</span>
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg tracking-tight text-slate-700">
            AI-powered meeting automation for Zoom. Record, transcribe, and extract insights from your meetings automatically.
          </p>
          <div className="mt-10 flex justify-center gap-x-6">
            <button
              onClick={handleLogin}
              className="group inline-flex items-center justify-center rounded-full py-4 px-8 text-lg font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 focus-visible:outline-primary-600 transition-colors duration-200"
            >
              <span>Sign in with Zoom</span>
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform duration-200" />
            </button>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-4xl">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-3 lg:gap-y-16">
            <div className="relative pl-16">
              <dt className="text-base font-semibold leading-7 text-gray-900">
                <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600">
                  <Video className="h-6 w-6 text-white" />
                </div>
                Smart Recording
              </dt>
              <dd className="mt-2 text-base leading-7 text-gray-600">
                Automatically join and record your Zoom meetings with intelligent bot technology.
              </dd>
            </div>

            <div className="relative pl-16">
              <dt className="text-base font-semibold leading-7 text-gray-900">
                <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600">
                  <Zap className="h-6 w-6 text-white" />
                </div>
                AI Transcription
              </dt>
              <dd className="mt-2 text-base leading-7 text-gray-600">
                Get accurate, real-time transcriptions powered by advanced AI technology.
              </dd>
            </div>

            <div className="relative pl-16">
              <dt className="text-base font-semibold leading-7 text-gray-900">
                <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                Secure & Private
              </dt>
              <dd className="mt-2 text-base leading-7 text-gray-600">
                Enterprise-grade security with encrypted storage and secure OAuth authentication.
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
};

export default Home; 