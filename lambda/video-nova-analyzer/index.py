import json, os, base64, subprocess, tempfile, time, boto3

bedrock = boto3.client('bedrock-runtime')
s3 = boto3.client('s3')
ddb = boto3.resource('dynamodb').Table(os.environ['ANALYSIS_TABLE'])

CLASSIFICATIONS = [
    'approach', 'interaction', 'conversation',
    'processing', 'departure', 'idle', 'other'
]
FFMPEG = '/opt/bin/ffmpeg'

def extract_frame(bucket, s3_key, timestamp):
    with tempfile.TemporaryDirectory() as tmp:
        video_path = os.path.join(tmp, 'video.mp4')
        frame_path = os.path.join(tmp, 'frame.jpg')
        s3.download_file(bucket, s3_key, video_path)
        subprocess.run(
            [FFMPEG, '-ss', str(timestamp), '-i', video_path,
             '-frames:v', '1', '-q:v', '5', frame_path, '-y'],
            capture_output=True, check=True
        )
        with open(frame_path, 'rb') as f:
            return base64.b64encode(f.read()).decode()

def handler(event, context):
    segments = event['segments']
    s3_key = event['s3Key']
    bucket = event['bucket']
    model_id = os.environ['MODEL_ID']

    audio_segments = [s for s in segments if s['has_audio']]
    total = len(audio_segments)
    completed = 0

    ddb.update_item(
        Key={'uploadId': event['uploadId']},
        UpdateExpression='SET segmentsComplete = :c, segmentsTotal = :t, startedAt = :s',
        ExpressionAttributeValues={':c': 0, ':t': total, ':s': int(time.time())}
    )

    analyzed = []
    for seg in segments:
        if seg['has_audio']:
            mid = (seg['start'] + seg['end']) / 2
            prompt = (
                f"This is a frame from a video segment ({seg['start']:.1f}s–{seg['end']:.1f}s). "
                f"Describe what is happening. Classify as one of: {', '.join(CLASSIFICATIONS)}. "
                f"Is this actionable (meaningful interaction)? "
                f'Respond in JSON only, no markdown: {{"description": str, "classification": str, "actionable": bool}}'
            )
            try:
                frame_b64 = extract_frame(bucket, s3_key, mid)
                response = bedrock.invoke_model(
                    modelId=model_id,
                    body=json.dumps({
                        "messages": [{
                            "role": "user",
                            "content": [
                                {"image": {"format": "jpeg", "source": {"bytes": frame_b64}}},
                                {"text": prompt}
                            ]
                        }],
                        "inferenceConfig": {"maxTokens": 512}
                    })
                )
                body = json.loads(response['body'].read())
                text = body['output']['message']['content'][0]['text'].strip()
                if text.startswith('```'):
                    text = text.split('\n', 1)[-1].rsplit('```', 1)[0].strip()
                analysis = json.loads(text)
                seg['description'] = analysis.get('description', 'Analysis unavailable')
                seg['classification'] = analysis.get('classification', 'other')
                seg['actionable'] = analysis.get('actionable', True)
            except Exception as e:
                seg['description'] = f'Analysis failed: {str(e)}'
                seg['classification'] = 'other'
                seg['actionable'] = True

            completed += 1
            ddb.update_item(
                Key={'uploadId': event['uploadId']},
                UpdateExpression='SET segmentsComplete = :c',
                ExpressionAttributeValues={':c': completed}
            )
            s3.put_object(
                Bucket=bucket,
                Key=f"analysis/{event['uploadId']}/progress.json",
                Body=json.dumps({'segmentsComplete': completed, 'segmentsTotal': total, 'status': 'PROCESSING'}),
                ContentType='application/json'
            )
        else:
            seg['description'] = 'No audio detected - silent segment'
            seg['classification'] = 'idle'
            seg['actionable'] = False
        analyzed.append(seg)

    return {**event, 'segments': analyzed}
