FasdUAS 1.101.10   ��   ��    k             i         I     ������
�� .aevtoappnull  �   � ****��  ��    I     �������� (0 closenotifications closeNotifications��  ��     	 
 	 l     ��������  ��  ��   
     i        I      �������� (0 closenotifications closeNotifications��  ��    Q     x     k    V       l   ��  ��    � � This function closes all currently displaying notification alerts. It used to also return the titles of each notification, which I have commented out to disable.     �  D   T h i s   f u n c t i o n   c l o s e s   a l l   c u r r e n t l y   d i s p l a y i n g   n o t i f i c a t i o n   a l e r t s .   I t   u s e d   t o   a l s o   r e t u r n   t h e   t i t l e s   o f   e a c h   n o t i f i c a t i o n ,   w h i c h   I   h a v e   c o m m e n t e d   o u t   t o   d i s a b l e .      l   T     O    T    l   S    !  O    S " # " k    R $ $  % & % r    & ' ( ' 6   $ ) * ) 2    ��
�� 
cwin * G    # + , + =    - . - 1    ��
�� 
sbrl . m     / / � 0 0 2 A X N o t i f i c a t i o n C e n t e r A l e r t , =   " 1 2 1 1    ��
�� 
sbrl 2 m    ! 3 3 � 4 4 4 A X N o t i f i c a t i o n C e n t e r B a n n e r ( o      ���� 0 thesewindows theseWindows &  5 6 5 l  ' '�� 7 8��   7  set theseTitles to {}    8 � 9 9 * s e t   t h e s e T i t l e s   t o   { } 6  : ; : l  ' P < = > < X   ' P ?�� @ ? Q   7 K A B�� A k   : B C C  D E D l  : :�� F G��   F + % Save the title of each alert window:    G � H H J   S a v e   t h e   t i t l e   o f   e a c h   a l e r t   w i n d o w : E  I J I l  : :�� K L��   K P Jset thisTitle to the value of static text 1 of scroll area 1 of thisWindow    L � M M � s e t   t h i s T i t l e   t o   t h e   v a l u e   o f   s t a t i c   t e x t   1   o f   s c r o l l   a r e a   1   o f   t h i s W i n d o w J  N O N l  : :�� P Q��   P - 'set the end of theseTitles to thisTitle    Q � R R N s e t   t h e   e n d   o f   t h e s e T i t l e s   t o   t h i s T i t l e O  S T S l  : :��������  ��  ��   T  U V U l  : :�� W X��   W   Close each alert:    X � Y Y $   C l o s e   e a c h   a l e r t : V  Z�� Z I  : B�� [��
�� .prcsclicnull��� ��� uiel [ n   : > \ ] \ 4   ; >�� ^
�� 
butT ^ m   < = _ _ � ` ` 
 C l o s e ] o   : ;���� 0 
thiswindow 
thisWindow��  ��   B R      ������
�� .ascrerr ****      � ****��  ��  ��  �� 0 
thiswindow 
thisWindow @ o   * +���� 0 thesewindows theseWindows =  "theseWindows"    > � a a  " t h e s e W i n d o w s " ;  b�� b l  Q Q�� c d��   c  return theseTitles    d � e e $ r e t u r n   t h e s e T i t l e s��   # 4    �� f
�� 
prcs f m   	 
 g g � h h & N o t i f i c a t i o n   C e n t e r     "NotCenter"    ! � i i    " N o t C e n t e r "  m     j j�                                                                                  sevs  alis    �  Macintosh HD               �dҚH+   ��cSystem Events.app                                               �?�A��        ����  	                CoreServices    �e
�      �A�9     ��c ��` ��_  =Macintosh HD:System: Library: CoreServices: System Events.app   $  S y s t e m   E v e n t s . a p p    M a c i n t o s h   H D  -System/Library/CoreServices/System Events.app   / ��      "SysEvents"     � k k    " S y s E v e n t s "   l�� l l  U U��������  ��  ��  ��    R      �� m n
�� .ascrerr ****      � **** m o      ���� 0 errormessage errorMessage n �� o��
�� 
errn o o      ���� 0 errornumber errorNumber��    Z   ^ x p q���� p =  ^ a r s r o   ^ _���� 0 errornumber errorNumber s o   _ `���� 0 errornumber errorNumber q k   d t t t  u v u n  d i w x w I   e i�������� <0 addapplettoaccessibilitylist addAppletToAccessibilityList��  ��   x  f   d e v  y�� y R   j t���� z
�� .ascrerr ****      � ****��   z �� {��
�� 
errn { m   n q��������  ��  ��  ��     | } | l     ��������  ��  ��   }  ~�� ~ i      �  I      �������� <0 addapplettoaccessibilitylist addAppletToAccessibilityList��  ��   � k     d � �  � � � l     �� � ���   � q k This function gets the user to enable Accessibility, for scripting the UI interface (hitting buttons etc.)    � � � � �   T h i s   f u n c t i o n   g e t s   t h e   u s e r   t o   e n a b l e   A c c e s s i b i l i t y ,   f o r   s c r i p t i n g   t h e   U I   i n t e r f a c e   ( h i t t i n g   b u t t o n s   e t c . ) �  � � � r      � � � l     ����� � I    �� ���
�� .earsffdralis        afdr �  f     ��  ��  ��   � o      ����  0 thisappletfile thisAppletFile �  � � � O    � � � I   �� ���
�� .miscmvisnull���    obj  � o    ����  0 thisappletfile thisAppletFile��   � m    	 � ��                                                                                  MACS  alis    t  Macintosh HD               �dҚH+   ��c
Finder.app                                                      ��q�`�        ����  	                CoreServices    �e
�      �`D     ��c ��` ��_  6Macintosh HD:System: Library: CoreServices: Finder.app   
 F i n d e r . a p p    M a c i n t o s h   H D  &System/Library/CoreServices/Finder.app  / ��   �  ��� � O    d � � � k    c � �  � � � I   ������
�� .ascrnoop****      � ****��  ��   �  � � � I   "������
�� .miscactvnull��� ��� null��  ��   �  � � � l  # #��������  ��  ��   �  � � � I  # /�� ���
�� .miscmvisnull���    obj  � n   # + � � � 4   ( +�� �
�� 
xppa � m   ) * � � � � � " P r i v a c y _ A s s i s t i v e � 5   # (�� ���
�� 
xppb � m   % & � � � � � : c o m . a p p l e . p r e f e r e n c e . s e c u r i t y
�� kfrmID  ��   �  � � � l  0 0��������  ��  ��   �  � � � I  0 5������
�� .miscactvnull��� ��� null��  ��   �  � � � l  6 6��������  ��  ��   �  ��� � I  6 c�� � �
�� .sysodisAaleR        TEXT � l 	 6 7 ����� � m   6 7 � � � � � 6 A d d   A p p l e t   t o   A c c e s s i b i l i t y��  ��   � �� ���
�� 
mesS � b   8 _ � � � b   8 [ � � � b   8 Y � � � b   8 W � � � b   8 S � � � b   8 Q � � � b   8 O � � � b   8 K � � � b   8 I � � � b   8 G � � � b   8 C � � � b   8 A � � � b   8 ? � � � b   8 = � � � b   8 ; � � � m   8 9 � � � � �J I n   o r d e r   t o   r e s p o n d   t o   u s e r   c l i c k s   o n   N o t i f i c a t i o n   p a n e l s   a n d   a l e r t s ,   t h i s   a p p l e t   m u s t   b e   a d d e d   t o   t h e   l i s t   o f   a p p s   a p p r o v e d   t o   u s e   a c c e s s i b i l i t y   c o n t r o l s   o f   t h e   O S . � o   9 :��
�� 
ret  � o   ; <��
�� 
ret  � l 	 = > ����� � m   = > � � � � �   T o   a d d   t h i s   a p p :��  ��   � o   ? @��
�� 
ret  � o   A B��
�� 
ret  � l 	 C F ����� � m   C F � � � � � � 1 )   C l i c k   t h e   l o c k   i c o n   ( i f   i t   i s   l o c k e d )   a n d   e n t e r   y o u r   p a s s w o r d .��  ��   � o   G H��
�� 
ret  � o   I J��
�� 
ret  � l 	 K N ����� � m   K N � � � � � � 2 )   I f   ' S y s t e m U I S e r v e r . a p p '   i s   i n   t h e   l i s t ,   c h e c k   t h e   b o x   n e x t   t o   i t ' s   n a m e .��  ��   � o   O P��
�� 
ret  � o   Q R��
�� 
ret  � l 	 S V ����� � m   S V � � � � �Z O t h e r w i s e ,   i f   t h e   a p p l e t ' s   n a m e   i s   i n   t h e   l i s t ,   c h e c k   t h e   b o x   n e x t   t o   i t ' s   n a m e .   I f   i t ' s   n o t   i n   t h e   l i s t ,   d r a g   t h e   a p p l e t   ( c u r r e n t l y   s h o w n   i n   t h e   F i n d e r )   i n t o   t h e   l i s t   a r e a .��  ��   � o   W X��
�� 
ret  � o   Y Z��
�� 
ret  � l 	 [ ^ ����� � m   [ ^ � � � � � � 3 )   C l i c k   t h e   l o c k   t o   r e - l o c k   t h e   p r e f e r e n c e   p a n e ,   c l o s e   S y s t e m   P r e f e r e n c e s .��  ��  ��  ��   � m     � ��                                                                                  sprf  alis    ~  Macintosh HD               �dҚH+   �ǅSystem Preferences.app                                          �8�?F        ����  	                Applications    �e
�      �?E�     �ǅ  1Macintosh HD:Applications: System Preferences.app   .  S y s t e m   P r e f e r e n c e s . a p p    M a c i n t o s h   H D  #Applications/System Preferences.app   / ��  ��  ��       � � � � ��   � �~�}�|
�~ .aevtoappnull  �   � ****�} (0 closenotifications closeNotifications�| <0 addapplettoaccessibilitylist addAppletToAccessibilityList � �{ �z�y � ��x
�{ .aevtoappnull  �   � ****�z  �y   �   � �w�w (0 closenotifications closeNotifications�x *j+   � �v �u�t � ��s�v (0 closenotifications closeNotifications�u  �t   � �r�q�p�o�r 0 thesewindows theseWindows�q 0 
thiswindow 
thisWindow�p 0 errormessage errorMessage�o 0 errornumber errorNumber �  j�n g�m ��l / 3�k�j�i�h _�g�f�e�d ��c�b�a
�n 
prcs
�m 
cwin �  
�l 
sbrl
�k 
kocl
�j 
cobj
�i .corecnte****       ****
�h 
butT
�g .prcsclicnull��� ��� uiel�f  �e  �d 0 errormessage errorMessage � �`�_�^
�` 
errn�_ 0 errornumber errorNumber�^  �c <0 addapplettoaccessibilitylist addAppletToAccessibilityList
�b 
errn�a���s y X� N*��/ F*�-�[[�,\Z�8\[�,\Z�8B1E�O (�[��l 
kh  ���/j W X  h[OY��OPUUOPW !X  ��  )j+ O)a a lhY h � �] ��\�[ � ��Z�] <0 addapplettoaccessibilitylist addAppletToAccessibilityList�\  �[   � �Y�Y  0 thisappletfile thisAppletFile � �X ��W ��V�U�T ��S�R � ��Q ��P � � � � ��O
�X .earsffdralis        afdr
�W .miscmvisnull���    obj 
�V .ascrnoop****      � ****
�U .miscactvnull��� ��� null
�T 
xppb
�S kfrmID  
�R 
xppa
�Q 
mesS
�P 
ret 
�O .sysodisAaleR        TEXT�Z e)j  E�O� �j UO� N*j O*j O*���0��/j O*j O����%�%�%�%�%a %�%�%a %�%�%a %�%�%a %l Uascr  ��ޭ