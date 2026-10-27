/* Supra — tell women's and men's first names apart, so each guest is drawn as a woman or a man.
   Works for Georgian (ქართული), the same names typed in Latin or Cyrillic letters, and common Russian,
   Armenian, Azerbaijani, Ukrainian and English names. SupraNames.guess(fullName) → 'f' | 'm' | null (not sure).
   Name order doesn't matter ("ნინო ბერიძე" and "ბერიძე ნინო" both work); surnames are skipped. */
(function(){
// Georgian first names, including everyday short forms.
const KA_F=`ანა ანი ანანო ანუკა ანიკო ანუ ანასტასია ალექსანდრა ალინა ალისა ამალია ანჟელა ანჟელიკა ასმათ ბარბარე ბაია ბელა ბელლა გვანცა გულიკო
გულნარა გულო გიული დალი დარეჯან დარიკო დიანა დინარა დოდო ეკა ეკუნა ეკატერინე ეკატერინა ელენე ელენა ელისო ელზა ელისაბედ ელიზაბედ ელინე ეთერ ეთო ეთუნა
ვერა ვიქტორია ზეინაბ ზინა ზოია ზარინა თამარ თამარა თამთა თამუნა თამუკა თაკო თაკუნა თათია თათა თეა თეო თეონა თინათინ თინა თიკო თინიკო ია იამზე ილონა ინგა
ინეზა ირინა ირინე ირმა იზოლდა ლალი ლამარა ლანა ლელა ლია ლიანა ლიკა ლილი ლილე ლუიზა ლეილა ლიზა ლიზი ლენა ლუსი მაგდა მაგდალინა მაგული მადონა მაია მაიკო მაკა
მაკო მანანა მარი მარიამ მარიკა მარინა მართა მარგო მარგალიტა მაყვალა მზია მზევინარ მზექალა მედეა მეგი მექი ნაზი ნათია ნათელა ნანა ნანი ნანული ნატა ნატალია
ნატალი ნატო ნატუკა ნესტან ნია ნინა ნინო ნინი ნინიკო ნინუცა ნუცა ნუნუ ნონა ნონიკო ოლღა ოლია ჟუჟუნა ჟანა რუსუდან რუსიკო რუსო სალომე სალო სოფიკო სოფიო სოფო
სოფია სოფი სვეტლანა ტატიანა ტასო ტიკო ფატიმა ქეთევან ქეთი ქეთო ქეთუნა ქრისტინე ქრისტინა შორენა შუშანა ციალა ციცინო ციცი ცირა ციური ციკო ხათუნა ხატია ხათია
ჯულიეტა ჯულია ცისანა ცისია ნინელი ლოლიტა ლაურა ლარისა ლუდმილა ლუბა ნადია ნადეჟდა ოქსანა იულია იული ეველინა ემა ემილია ელიკო ელისაბეთ ინესა ნარგიზა
რიტა ტინა მერი მეგონა ნესტანი ფიქრია ხვთისო ჩიორა ცაცა ჟენია მაშო ქეთინო თამრიკო ლიკუნა ანეტა ალექსანდრინე ეთერი ნინოჩკა მარიკუნა თეკლა`;
const KA_M=`აკაკი ალეკო ალექსანდრე ალექსი ალიკო ამირან ანდრია ანდრო ანზორ ავთანდილ ავთო არჩილ არჩი ბადრი ბაჩო ბაჩანა ბექა ბესარიონ ბესო ბიძინა ბონდო ბაკურ ბაკური
გაგა გაბრიელ გელა გია გიგა გიგი გიორგი გივი გოგა გოგი გოგიტა გოდერძი გრიგოლ გურამ გუგა გოჩა დავით დათო დათუნა დემნა დიმიტრი დიტო ელგუჯა ემზარ ემილ ერეკლე
ვაკო ვალერი ვანო ვასილ ვაჟა ვახტანგ ვახო ვატო ზაზა ზვიად ზურა ზურაბ ზაალ თამაზ თემო თემურ თეიმურაზ თორნიკე თენგიზ ილია ილო ირაკლი იოსებ იასონ კახა კახაბერ
კობა კოკა კონსტანტინე კოსტა კოტე კარლო ლადო ლაშა ლევან ლექსო ლუკა ლერი ლუარსაბ მამუკა მალხაზ მამია მერაბ მიხეილ მიხო მიშა მიშიკო მინდია მურმან მურთაზ
ნიკა ნიკო ნიკოლოზ ნიკუშა ნოდარ ნუგზარ ნესტორ ნიაზ ოთარ ოთო ომარ პაატა პეტრე პავლე რამაზ რატი რევაზ რეზო რომან როინ რუსლან რობერტ საბა სანდრო სერგო სერგი
სიმონ სოსო სულხან ტარიელ ტატო ტემო ტრისტან უჩა უშანგი ფრიდონ შალვა შოთა შაქრო ცოტნე ხვიჩა ხარიტონ ჯაბა ჯემალ ჯონი ჯუმბერ ჯანო ჯანსუღ ჯონდო ზვიადი
ნიკოლა ვლადიმერ ვოვა ბორის იგორ ოლეგ სერგეი დიმა ალექსეი იური ბექარ გელო გუჯა დაჩი ელიზბარ თეო ლუკაი მირიან ნიკოლოზი რეზი სტეფანე ფარნაოზ ქაიხოსრო
ბაგრატ ბაჩუკი დათიკო ზურიკო გიორგიკა ლევანიკო მიკა ნუკრი თეიმურაზი იოანე ანტონ არტურ ედუარდ ელდარ ემზარი ვიქტორ ილიკო მევლუდ რუბენ შმაგი ტიტე`;
// Russian, Ukrainian, Armenian, Azerbaijani and English names often seen at Georgian weddings (Latin or Cyrillic).
const X_F=`anna mariya maria elena yelena olga natalya natalia irina tatyana tatiana svetlana ekaterina yekaterina yulia julia anastasia darya daria ksenia
viktoria victoria lyudmila ludmila galina valentina nina tamara larisa marina alla vera nadezhda lyubov sofya sofia sophia polina alina kristina oksana
elizaveta liza margarita veronika alisa arina diana eva zhanna inna lilia milana nelly raisa rimma snezhana taisia ulyana yana zoya lusine anahit gayane
hasmik karine lilit mariam narine ruzanna satenik shushan siranush aida aygun gunel leyla leila narmin sevinj aysel nigar ulviyya mary elizabeth emma olivia
emily sarah jessica laura kate katie anne julie linda susan karen lisa helen hannah grace chloe lucy alice rachel rebecca amy megan lauren jennifer nicole
natalie isabella mia ava charlotte amelia evelyn abigail ella scarlett lily zoe nora hazel leah ruby clara maya sophie sophy jane emily claire madison
melissa michelle stephanie amanda heather samantha elena eleni katerina maria giulia francesca chiara sara anne-marie marie camille lea manon ines
анна мария елена ольга наталья наталия ирина татьяна светлана екатерина юлия анастасия дарья ксения виктория людмила галина валентина нина
тамара лариса марина алла вера надежда любовь софья софия полина алина кристина оксана елизавета маргарита вероника кетеван натия манана`;
const X_M=`aleksandr alexander sergey sergei dmitry dmitri andrey andrei aleksey alexei maksim maxim ivan mikhail nikolai nikolay vladimir evgeny yevgeny pavel
artem artyom oleg igor viktor victor yuri yury roman denis konstantin boris grigory georgy georgiy david ilya nikita lev timur ruslan vadim anton kirill
fyodor fedor petr pyotr stanislav vladislav vitaly vyacheslav arkady gennady leonid valery yaroslav bogdan taras artur armen aram ashot gor hayk karen
levon narek tigran vahe vardan arman samvel ali elchin elnur farid kamran orkhan rashad rustam tural vugar zaur emin eldar ilgar john james robert michael
william richard joseph thomas charles daniel matthew anthony mark paul steven andrew joshua kevin brian george edward peter jack harry oliver noah liam lucas
ethan henry benjamin samuel nathan adam ryan luke simon martin patrick tom tim max leo oscar jacob logan mason elijah aiden owen caleb dylan nicholas
christopher jonathan stephen frank philip giovanni marco luca matteo pierre jean louis antoine hugo hans stefan
александр сергей дмитрий андрей алексей максим иван михаил николай владимир евгений павел артем олег игорь виктор юрий роман денис константин
борис григорий георгий давид илья никита лев тимур руслан вадим антон кирилл федор петр зураб гия леван ираклий вахтанг тенгиз гурам отар реваз`;
// Words that tell the gender by themselves: titles and family words.
const T_F='ქალბატონი ქალბატონ ქნ დეიდა მამიდა ბებია ბებო დედა რძალი სიდედრი დედამთილი ბიცოლა მული mrs ms miss madam madame mme lady aunt grandma grandmother mother mom sister bride госпожа тётя тетя бабушка мама сестра невеста';
const T_M='ბატონი ბატონ ბნ ბიძა ბიძია ბაბუა ბაბუ მამა ძმა სიძე მაზლი სიმამრი მამამთილი ძია მეჯვარე mr mister sir lord uncle grandpa grandfather father dad brother groom господин дядя дедушка папа брат жених';
// Names that are both (Sasha, Alex…) — never guessed.
const BOTH='საშა ჟენია ვალია alex sasha zhenya valya kim jordan taylor morgan casey jamie robin sam chris pat lee nikki';

const set=s=>new Set(s.toLowerCase().split(/\s+/).filter(w=>w&&!w.endsWith('?')));
const F=set(KA_F),M=set(KA_M),XF=set(X_F),XM=set(X_M),TF=set(T_F),TM=set(T_M),AMB=set(BOTH);
// The same Georgian names in Latin (national transliteration and common spellings) and in Cyrillic.
const LAT={ა:'a',ბ:'b',გ:'g',დ:'d',ე:'e',ვ:'v',ზ:'z',თ:'t',ი:'i',კ:'k',ლ:'l',მ:'m',ნ:'n',ო:'o',პ:'p',ჟ:'zh',რ:'r',ს:'s',ტ:'t',უ:'u',ფ:'p',ქ:'k',ღ:'gh',ყ:'q',შ:'sh',ჩ:'ch',ც:'ts',ძ:'dz',წ:'ts',ჭ:'ch',ხ:'kh',ჯ:'j',ჰ:'h'};
const CYR={ა:'а',ბ:'б',გ:'г',დ:'д',ე:'е',ვ:'в',ზ:'з',თ:'т',ი:'и',კ:'к',ლ:'л',მ:'м',ნ:'н',ო:'о',პ:'п',ჟ:'ж',რ:'р',ს:'с',ტ:'т',უ:'у',ფ:'ф',ქ:'к',ღ:'г',ყ:'к',შ:'ш',ჩ:'ч',ც:'ц',ძ:'дз',წ:'ц',ჭ:'ч',ხ:'х',ჯ:'дж',ჰ:'х'};
const tr=(w,map)=>[...w].map(c=>map[c]??c).join('');
const variants=w=>{const l=tr(w,LAT),c=tr(w,CYR);return[l,l.replace(/kh/g,'h'),l.replace(/kh/g,'x'),l.replace(/ph|p/g,'ph'),l.replace(/ts/g,'c'),l.replace(/sh/g,'sch'),l.replace(/zh/g,'j'),
  l.replace(/k/g,'q'),l.replace(/ch/g,'tch'),l.replace(/^i/,'y'),l.replace(/gh/g,'g'),c,c.replace(/и$/,'ий'),c.replace(/а$/,'я')]};
for(const w of[...F])variants(w).forEach(v=>XF.add(v));
for(const w of[...M])variants(w).forEach(v=>XM.add(v));
// Well-known English forms of Georgian names.
'nino tamar tamara mariam ketevan keti sophie sopho salome ana anna natia nato eka maka lika lela tea nana'.split(' ').forEach(w=>XF.add(w));
'george giorgi gio david dato levan luka lasha irakli nika nick alexander sandro zurab vakhtang beka saba tornike otar'.split(' ').forEach(w=>XM.add(w));
// A few spellings appear in both lists after transliteration (e.g. "tina"); those stay undecided.
for(const w of[...XF])if(XM.has(w)){XF.delete(w);XM.delete(w);AMB.add(w)}
for(const w of[...F])if(M.has(w)){F.delete(w);M.delete(w);AMB.add(w)}

// Georgian, Armenian, Azerbaijani and Russian surname endings — words with these are skipped when looking for the first name.
const SURNAME=/(ძე|შვილი|ია|ავა|უა|ური|ული|ანი|ენი|ელი|ონი|ეთი|ყანი|ურია|ძიანი|dze|shvili|ia|ava|ua|uri|uli|ani|eni|eli|oni|yan|ian|ov|ova|ev|eva|in|ina|sky|skaya|ский|ская|ов|ова|ев|ева|ин|ина|ян|дзе|швили)$/;
const norm=w=>w.normalize('NFC').toLowerCase().replace(/[.,;:()"'„“”«»!?\d]+/g,'').replace(/ё/g,'е').trim();
function one(w){if(!w||AMB.has(w))return null;
  if(F.has(w)||XF.has(w)||TF.has(w))return'f';if(M.has(w)||XM.has(w)||TM.has(w))return'm';return null}
function guess(full){
  const words=String(full||'').replace(/ქ-ნ(ი)?/g,'ქალბატონი').replace(/ბ-ნ(ი)?/g,'ბატონი').split(/[\s\-–—/]+/).map(norm).filter(Boolean);if(!words.length)return null;
  // titles and family words decide first ("ბატონი ზურა", "დეიდა ლია", "Mrs Smith")
  for(const w of words){if(TF.has(w))return'f';if(TM.has(w))return'm'}
  // then the first word that is a known first name, trying non-surname-looking words first
  const order=[...words.filter(w=>!SURNAME.test(w)),...words.filter(w=>SURNAME.test(w))];
  for(const w of order){const g=one(w);if(g)return g}
  // unknown name in Latin or Cyrillic letters: -a/-ya endings are mostly women's names in these languages
  const first=order[0];
  if(/^[a-zа-я]+$/.test(first)&&!AMB.has(first)){
    if(/(а|я|ia|ya|a)$/.test(first)&&!/(ka|sha|ha|la|ta|ra|ma|та|ша|ка|ля|ва|ня|ия)$/.test(first))return'f';
  }
  return null}
window.SupraNames={guess,_lists:{F,M,XF,XM}};
})();
