const uploadButton = document.getElementById('uploadButton');
        const startInterview = document.getElementById('startInterview');
        const submitResponse = document.getElementById('submitResponse');
        const concludeInterview = document.getElementById('concludeInterview');
        let currentQuestionIndex = 0;
        let interviewQuestions = [];
        let interviewHistory = '';
        let transcriptionText = '';
        let recognition;
        let recordingInProgress = false;
        let currentQuestion;
        let resumeText = '';
        let isTTSPlaying = false;
        let isFollowUp = false;
        let followUpQuestionIndex = 0;
        let interviewStarted = false;

        // Initialize Speech Recognition
        if ('webkitSpeechRecognition' in window) {
            recognition = new webkitSpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onresult = (event) => {
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        transcriptionText += event.results[i][0].transcript + ' ';
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
                document.getElementById('transcriptionBox').value = transcriptionText + interimTranscript;
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                if (event.error === 'no-speech') {
                    console.log('No speech detected. Restarting recognition...');
                    setTimeout(() => {
                        if (!recordingInProgress) {
                            startRecording(); // Attempt to restart recognition
                        }
                    }, 1000); // Delay before restarting
                }
            };

            recognition.onend = () => {
                if (recordingInProgress) {
                    recognition.start(); // Restart recognition if needed
                }
            };
        } else {
            alert('Speech recognition not supported in this browser.');
        }

        uploadButton.addEventListener('click', async () => {
            const resumeFile = document.getElementById('resumeUpload').files[0];
            const companyUrl = document.getElementById('companyInput').value; // Update variable name to `companyUrl`
            if (!resumeFile) return alert('Please upload a resume');
            if (!companyUrl) return alert('Please enter a company URL'); // Update validation message

            const formData = new FormData();
            formData.append('file', resumeFile);
            formData.append('company_url', companyUrl); // Update form data key to `company_url`

            try {
                alert('Uploading resume and fetching company details...');

                const response = await axios.post('https://hr-interview-server-f3.onrender.com/generate_questions', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                });

                console.log('Server response:', response);

                if (response.data && Array.isArray(response.data.questions) && typeof response.data.resume_text === 'string') {
                    interviewQuestions = ["Tell me about yourself", ...response.data.questions];
                    resumeText = response.data.resume_text;
                    document.getElementById('questions').innerHTML = 'Questions generated based on your resume and the company details will be asked in turn.';
                    currentQuestionIndex = 1; // Start with the first resume-based question
                    isFollowUp = false;
                    followUpQuestionIndex = 0;
                    interviewStarted = false; // Reset interview started flag
                } else {
                    throw new Error('Invalid response format: ' + JSON.stringify(response.data));
                }
            } catch (error) {
                console.error('Error uploading resume and generating questions:', error.response || error);
                alert('Error generating questions. Check the console for more details.');
            }
        });

        startInterview.addEventListener('click', async () => {
            if (!interviewStarted) {
                await askTellMeAboutYourself();
                interviewStarted = true; // Set flag to indicate interview has started
            }
        });

        submitResponse.addEventListener('click', async () => {
            const finalTranscription = transcriptionText.trim();
            if (finalTranscription) {
                try {
                    stopRecording(); 

                    interviewHistory += `Q: ${currentQuestion}\nA: ${finalTranscription}\n`;

                    document.getElementById('transcriptionBox').value = '';
                    transcriptionText = ''; 

                    if (isFollowUp) {
                        isFollowUp = false;
                        followUpQuestionIndex++;
                        await askNextQuestion();
                    } else {
                        const response = await axios.post('https://hr-interview-server-f3.onrender.com/generate_follow_up', {
                            question: currentQuestion,
                            response: finalTranscription,
                            resume_text: resumeText
                        });

                        const followUpQuestions = response.data.follow_up_questions;
                        if (followUpQuestions && followUpQuestions.length > 0) {
                            const followUpQuestion = followUpQuestions[followUpQuestionIndex] || followUpQuestions[0];
                            document.getElementById('transcriptionBox').value = followUpQuestion;

                            isTTSPlaying = true;
                            const audioUrl = await getTTSUrl(followUpQuestion);
                            if (audioUrl) {
                                const audio = new Audio();
                                audio.src = audioUrl;
                                audio.onerror = (error) => {
                                    console.error('Audio error:', error);
                                };
                                audio.onended = () => {
                                    isTTSPlaying = false;
                                    isFollowUp = true;
                                    startRecording();
                                };
                                audio.play().catch(error => {
                                    console.error('Play error:', error);
                                });

                                interviewHistory += `Q: ${followUpQuestion}\nA: `;
                            } else {
                                console.error('Failed to get TTS URL');
                                alert('Error playing follow-up question.');
                            }
                        } else {
                            await askNextQuestion();
                        }
                    }
                } catch (error) {
                    console.error('Error generating follow-up questions:', error.response || error);
                    alert('Error generating follow-up questions.');
                }
            }
        });

        concludeInterview.addEventListener('click', async () => {
            try {
                stopRecording(); 
                const response = await axios.post('https://hr-interview-server-f3.onrender.com/generate_feedback', {
                    interview_history: interviewHistory
                });

                const feedback = response.data.feedback;
                document.getElementById('feedback').innerText = feedback;
            } catch (error) {
                console.error('Error generating feedback:', error.response || error);
                alert('Error generating feedback.');
            }
        });

        async function askTellMeAboutYourself() {
            currentQuestion = "Tell me about yourself";
            document.getElementById('transcriptionBox').value = currentQuestion;

            isTTSPlaying = true;
            const audioUrl = await getTTSUrl(currentQuestion);
            if (audioUrl) {
                const audio = new Audio();
                audio.src = audioUrl;
                audio.onerror = (error) => {
                    console.error('Audio error:', error);
                };
                audio.onended = () => {
                    isTTSPlaying = false;
                    startRecording();
                };
                audio.play().catch(error => {
                    console.error('Play error:', error);
                });

                interviewHistory += `Q: ${currentQuestion}\nA: `;
            } else {
                console.error('Failed to get TTS URL');
                alert('Error playing initial question.');
            }
        }

        async function askNextQuestion() {
            if (currentQuestionIndex < interviewQuestions.length) {
                currentQuestion = interviewQuestions[currentQuestionIndex];
                document.getElementById('transcriptionBox').value = currentQuestion;

                isTTSPlaying = true;
                const audioUrl = await getTTSUrl(currentQuestion);
                if (audioUrl) {
                    const audio = new Audio();
                    audio.src = audioUrl;
                    audio.onerror = (error) => {
                        console.error('Audio error:', error);
                    };
                    audio.onended = () => {
                        isTTSPlaying = false;
                        startRecording();
                    };
                    audio.play().catch(error => {
                        console.error('Play error:', error);
                    });

                    interviewHistory += `Q: ${currentQuestion}\nA: `;

                    currentQuestionIndex++; // Move to the next question
                    isFollowUp = false;
                    followUpQuestionIndex = 0;
                } else {
                    console.error('Failed to get TTS URL');
                    alert('Error playing the next question.');
                }
            } else {
                document.getElementById('transcriptionBox').value = 'Interview completed.';
                setTimeout(() => {
                    concludeInterview.click(); 
                }, 2000); 
            }
        }

        async function getTTSUrl(text) {
            try {
                const cleanedText = text.replace(/<\/s>/g, ''); // Remove the </s> tag
                const response = await axios.post('https://hr-interview-server-f3.onrender.com/tts', { text: cleanedText }, {
                    responseType: 'blob'
                });

                const url = URL.createObjectURL(response.data);
                return url;
            } catch (error) {
                console.error('Error generating TTS:', error);
                return null;
            }
        }


        function startRecording() {
            if (!recordingInProgress && recognition) {
                recognition.start();
                recordingInProgress = true;
            }
        }

        function stopRecording() {
            if (recordingInProgress && recognition) {
                recognition.stop();
                recordingInProgress = false;
            }
        }






        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                alert('Link copied to clipboard!');
            }).catch(err => {
                alert('Failed to copy link.');
                console.error('Error:', err);
            });
        }

        document.getElementById('uploadButton').addEventListener('click', () => {
            // Show the loading spinner
            document.getElementById('loadingSpinner').style.display = 'block';

            // Simulate the process of uploading and fetching questions
            // Replace this with your actual upload and processing logic
            setTimeout(() => {
                // Hide the loading spinner after the process is done
                document.getElementById('loadingSpinner').style.display = 'none';
                
            
            }, 30000); // Simulated delay
        });

        // Hardcoded list of users (username:password)
        const users = {
            'test': 'test@v77',
            'v77': 'v77@'
        };

        // Login function
        document.getElementById('loginButton').addEventListener('click', () => {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            if (users[username] === password) {
                document.getElementById('loginContainer').style.display = 'none';
                document.getElementById('mainContent').style.display = 'flex';
            } else {
                document.getElementById('loginError').style.display = 'block';
            }
        });
