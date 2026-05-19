'use client';

import { useEffect } from 'react';
import usePetStore from './usePetStore';

export default function PetSettings() {
  const { isVisible, config, currentPet, init, setVisible, setPet } = usePetStore();

  useEffect(() => { init(); }, [init]);

  if (!config) {
    return <p className="text-sm text-muted-foreground">加载中...</p>;
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-foreground/80">显示桌面宠物</span>
        <button
          onClick={() => setVisible(!isVisible)}
          className={`w-10 h-5 rounded-full transition-colors duration-200 ${
            isVisible ? 'bg-primary' : 'bg-muted'
          } relative`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
              isVisible ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      <div>
        <p className="text-foreground/80 mb-2">选择宠物</p>
        <div className="grid grid-cols-4 gap-2">
          {config.pets.map((pet) => (
            <button
              key={pet.id}
              onClick={() => setPet(pet.id)}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                currentPet === pet.id
                  ? 'border-primary bg-primary/10'
                  : 'border-transparent hover:bg-muted/50'
              }`}
            >
              <div
                className="rounded"
                style={{
                  width: 40,
                  height: 44,
                  backgroundImage: `url(/pets/${pet.id}/${pet.spritesheetPath})`,
                  backgroundSize: `${40 * config.grid.cols}px ${44 * config.grid.rows}px`,
                  backgroundPosition: '0 0',
                  backgroundRepeat: 'no-repeat',
                  imageRendering: 'pixelated',
                }}
              />
              <span className="text-xs text-foreground/70 truncate w-full text-center">
                {pet.displayName}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
