import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { Button, Spinner } from '../ui';
import { cameraProblem, cameraSupported, type CameraProblem } from './camera';

const text = t.scorepads.wizard.camera;

/** Zdjęcie z kamery w pełnej rozdzielczości strumienia, JPEG 0,92. */
async function grabFrame(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (!context || !canvas.width || !canvas.height) throw new Error('camera: no frame');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('camera: no blob'))),
      'image/jpeg',
      0.92,
    );
  });
}

interface CameraCaptureProps {
  /** Zrobione zdjęcie. */
  readonly onCapture: (photo: Blob) => void;
  readonly onCancel: () => void;
  /** Kamera nie ruszyła: kreator wraca do pola z plikiem i pokazuje komunikat. */
  readonly onProblem: (problem: CameraProblem) => void;
}

/**
 * Kamera internetowa z podglądem na scenie kreatora (komputer). Prosi o tylny aparat,
 * jeśli urządzenie go ma, i o najwyższą rozdzielczość. Strumień jest zatrzymywany po zdjęciu,
 * anulowaniu i zamknięciu kreatora.
 */
export function CameraCapture({ onCapture, onCancel, onProblem }: CameraCaptureProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const onProblemRef = useRef(onProblem);

  useEffect(() => {
    onProblemRef.current = onProblem;
  });

  useEffect(() => {
    if (!cameraSupported()) {
      onProblemRef.current('unsupported');
      return;
    }
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 4096 },
          height: { ideal: 4096 },
        },
      })
      .then(
        async (granted) => {
          if (cancelled) {
            granted.getTracks().forEach((track) => track.stop());
            return;
          }
          stream = granted;
          const element = video.current;
          if (!element) return;
          element.srcObject = granted;
          await element.play().catch(() => undefined);
          if (!cancelled) setReady(true);
        },
        (error: unknown) => {
          if (!cancelled) onProblemRef.current(cameraProblem(error));
        },
      );
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const capture = async () => {
    const element = video.current;
    if (!element || capturing) return;
    setCapturing(true);
    try {
      onCapture(await grabFrame(element));
    } catch {
      setCapturing(false);
      onProblem('failed');
    }
  };

  return (
    <div className="wizard-camera">
      <video
        ref={video}
        className="wizard-camera__video"
        aria-label={text.label}
        playsInline
        muted
      />
      {ready ? null : (
        <div className="wizard-camera__status">
          <Spinner size={24} label={text.starting} />
        </div>
      )}
      <div className="wizard-toolbar" role="toolbar" aria-label={text.label}>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          {text.cancel}
        </Button>
        <Button
          size="sm"
          icon="camera"
          disabled={!ready}
          loading={capturing}
          onClick={() => void capture()}
        >
          {text.capture}
        </Button>
      </div>
    </div>
  );
}
