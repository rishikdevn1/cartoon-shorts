import React from 'react';
import { Composition } from 'remotion';
import { CharacterShowcase } from './CharacterShowcase.jsx';
export const Root = () => (
  <>
    <Composition id="CharacterShowcase" component={CharacterShowcase} durationInFrames={210} fps={30} width={1920} height={1080} />
    <Composition id="CharacterShowcaseVertical" component={CharacterShowcase} durationInFrames={210} fps={30} width={1080} height={1920} defaultProps={{ vertical: true }} />
  </>
);
